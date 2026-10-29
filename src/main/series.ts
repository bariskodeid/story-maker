import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { explainerTotalMs, getTemplate, type ExplainerTheme } from '@shared/explainer'
import { LANGUAGES } from '@shared/models'
import { castKey, episodeProjectTitle, parseCastNames } from '@shared/series'
import { getStyle } from '@shared/styles'
import type {
  CastSyncOptions,
  NewSeriesInput,
  Project,
  ProjectBundle,
  Series,
  SeriesBible,
  SeriesBundle,
  SeriesCharacter,
  SeriesEpisode,
  SeriesKind,
  SeriesPatch,
  SeriesSettingsPatch,
  SeriesSettingsResult,
  SeriesSummary,
  TtsProvider
} from '@shared/types'
import { defaultTtsVoice } from '@shared/voices'
import { getDb } from './db'
import { assetAbsPath, assetUrl, seriesDir, seriesFileUrl, seriesRoot } from './paths'
import { charactersOf, createProject, getAsset, getBundle, getProject, insertAsset, removeProject, setCharacterSheet } from './repo'
import { probeSize } from './services/audio'
import { getSettings } from './settings'

/**
 * Series and their shared cast. Each episode is an ordinary project (`projects.series_id`), so the editor,
 * one-click generate and export work on it unchanged. Assets never cross project folders (the exporter and the
 * preview resolve every path under the owning project), so the cast's character sheets are copied: into an
 * episode before it is generated, and back into the series folder once an episode has made new ones.
 *
 * Explainer series (a course of lessons, a recurring tips or facts show) have no cast: their episodes share a
 * template and look instead, and the cast copying below skips them.
 */

type Row = Record<string, any>

const EMPTY_BIBLE: SeriesBible = { world: '', tone: '', rules: '', hooks: [] }

/** A series' explainer look; the logo is a file of one project, so a series never carries one. */
function parseTheme(json: unknown): ExplainerTheme {
  try {
    const v = JSON.parse(typeof json === 'string' && json ? json : '{}')
    if (!v || typeof v !== 'object') return {}
    const { logoAssetId: _logo, ...rest } = v as ExplainerTheme
    return rest
  } catch {
    return {}
  }
}

function toSeries(r: Row): Series {
  const bible = JSON.parse(r.bible_json || '{}') as Partial<SeriesBible>
  const kind: SeriesKind = r.kind === 'explainer' ? 'explainer' : 'story'
  return {
    id: r.id,
    kind,
    title: r.title,
    premise: r.premise,
    continuity: r.continuity === 'anthology' ? 'anthology' : 'serial',
    bible: { ...EMPTY_BIBLE, ...bible, hooks: Array.isArray(bible.hooks) ? bible.hooks : [] },
    episodeCount: r.episode_count,
    durationSec: r.duration_sec,
    language: r.language,
    aspectRatio: r.aspect_ratio,
    styleId: r.style_id,
    ttsProvider: r.tts_provider,
    ttsVoice: r.tts_voice,
    imageModel: r.image_model,
    videoModel: r.video_model,
    templateId: kind === 'explainer' ? getTemplate(r.template_id).id : null,
    theme: kind === 'explainer' ? parseTheme(r.theme_json) : {},
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

function sheetAbs(seriesId: string, rel: string): string {
  return join(seriesRoot(), seriesId, rel)
}

function toSeriesCharacter(r: Row): SeriesCharacter {
  const sheet = r.sheet_path && existsSync(sheetAbs(r.series_id, r.sheet_path)) ? (r.sheet_path as string) : null
  return {
    id: r.id,
    seriesId: r.series_id,
    name: r.name,
    description: r.description,
    sheetPath: sheet,
    sheetUrl: sheet ? seriesFileUrl(r.series_id, sheet) : null,
    sort: r.sort
  }
}

const key = castKey

/**
 * Names of cast members removed by hand: from the series (`series`) or from one episode (`projects`). Copying the
 * cast in either direction never adds those back; only "Ambil pemeran seri" (restore) clears an episode's list.
 */
type CastOwner = 'series' | 'projects'

function removedCast(owner: CastOwner, id: string): Set<string> {
  const r = getDb().prepare(`SELECT cast_removed_json FROM ${owner} WHERE id = ?`).get(id) as Row | undefined
  return new Set(parseCastNames(r?.cast_removed_json))
}

function setRemovedCast(owner: CastOwner, id: string, names: Iterable<string>): void {
  getDb()
    .prepare(`UPDATE ${owner} SET cast_removed_json = ? WHERE id = ?`)
    .run(JSON.stringify([...new Set(names)].sort()), id)
}

/** A series of stories shares a cast; an explainer series has none, so nothing is copied for it. */
const sharesCast = (seriesId: string): boolean => getSeries(seriesId).kind === 'story'

// ---------- series ----------

export function createSeries(input: NewSeriesInput): Series {
  const s = getSettings()
  const now = Date.now()
  const id = randomUUID()
  const kind: SeriesKind = input.kind === 'explainer' ? 'explainer' : 'story'
  getDb()
    .prepare(
      `INSERT INTO series (id, kind, title, premise, continuity, bible_json, episode_count, duration_sec, language, aspect_ratio,
         style_id, tts_provider, tts_voice, image_model, video_model, template_id, theme_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?)`
    )
    .run(
      id,
      kind,
      'Seri tanpa judul',
      input.premise.trim(),
      input.continuity === 'anthology' ? 'anthology' : 'serial',
      JSON.stringify(EMPTY_BIBLE),
      Math.round(input.episodeCount),
      input.durationSec,
      input.language,
      input.aspectRatio,
      input.styleId,
      input.ttsProvider,
      defaultTtsVoice(input.ttsProvider, input.language),
      s.imageModel,
      s.videoModel,
      kind === 'explainer' ? getTemplate(input.templateId).id : null,
      now,
      now
    )
  seriesDir(id)
  return getSeries(id)
}

export function getSeries(id: string): Series {
  const r = getDb().prepare('SELECT * FROM series WHERE id = ?').get(id) as Row | undefined
  if (!r) throw new Error('Seri tidak ditemukan')
  return toSeries(r)
}

/** Episode projects in episode order. */
export function episodesOf(seriesId: string): Project[] {
  const ids = getDb().prepare('SELECT id FROM projects WHERE series_id = ? ORDER BY episode_no, created_at').all(seriesId) as Row[]
  return ids.map((r) => getProject(r.id))
}

export function seriesCast(seriesId: string): SeriesCharacter[] {
  return (getDb().prepare('SELECT * FROM series_characters WHERE series_id = ? ORDER BY sort').all(seriesId) as Row[]).map(toSeriesCharacter)
}

export function getSeriesBundle(id: string): SeriesBundle {
  const series = getSeries(id)
  const rows = getDb()
    .prepare(
      `SELECT p.id, p.title, p.synopsis, p.episode_no, p.episode_summary, p.status, p.step, p.updated_at,
        (SELECT COUNT(*) FROM clips c WHERE c.project_id = p.id) AS clip_count,
        (SELECT COALESCE(SUM(duration_ms), 0) FROM clips c WHERE c.project_id = p.id) AS total_ms,
        (SELECT a.local_path FROM assets a WHERE a.id = p.cover_asset_id) AS cover_path
       FROM projects p WHERE p.series_id = ? ORDER BY p.episode_no, p.created_at`
    )
    .all(id) as Row[]
  // An explainer scene lasts longer than its voice (lead-in and hold), so its length comes from the shared rule.
  const explainerMs = (projectId: string): number => {
    const b = getBundle(projectId)
    return explainerTotalMs(b.clips, Object.fromEntries(b.assets.map((a) => [a.id, a])))
  }
  const episodes: SeriesEpisode[] = rows.map((r) => ({
    id: r.id,
    no: r.episode_no ?? 0,
    title: r.title,
    synopsis: r.synopsis,
    summary: r.episode_summary ?? '',
    status: r.status,
    step: r.step,
    clipCount: r.clip_count,
    totalMs: series.kind === 'explainer' && r.clip_count > 0 ? explainerMs(r.id) : r.total_ms,
    coverUrl: r.cover_path ? assetUrl(r.id, r.cover_path) : null,
    updatedAt: r.updated_at
  }))
  return { series, characters: seriesCast(id), episodes }
}

export function listSeries(): SeriesSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT s.*,
        (SELECT COUNT(*) FROM projects p WHERE p.series_id = s.id) AS episodes,
        (SELECT COUNT(*) FROM projects p WHERE p.series_id = s.id AND p.status IN ('editing', 'exported')) AS ready,
        (SELECT COUNT(*) FROM projects p WHERE p.series_id = s.id AND p.status = 'exported') AS exported,
        (SELECT MAX(p.updated_at) FROM projects p WHERE p.series_id = s.id) AS episode_updated,
        (SELECT p.id || '|' || a.local_path FROM projects p JOIN assets a ON a.id = p.cover_asset_id
          WHERE p.series_id = s.id ORDER BY p.episode_no LIMIT 1) AS cover
       FROM series s`
    )
    .all() as Row[]
  return rows
    .map((r) => {
      const cover = typeof r.cover === 'string' ? (r.cover as string) : null
      const cut = cover ? cover.indexOf('|') : -1
      const kind: SeriesKind = r.kind === 'explainer' ? 'explainer' : 'story'
      return {
        id: r.id,
        title: r.title,
        kind,
        continuity: r.continuity === 'anthology' ? ('anthology' as const) : ('serial' as const),
        styleId: r.style_id,
        templateId: kind === 'explainer' ? getTemplate(r.template_id).id : null,
        episodeCount: r.episodes,
        readyCount: r.ready,
        exportedCount: r.exported,
        coverUrl: cover && cut > 0 ? assetUrl(cover.slice(0, cut), cover.slice(cut + 1)) : null,
        updatedAt: Math.max(r.updated_at, r.episode_updated ?? 0)
      }
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function updateSeries(id: string, patch: SeriesPatch): Series {
  const s = getSeries(id)
  const bible: SeriesBible = {
    ...s.bible,
    ...(patch.world !== undefined ? { world: String(patch.world) } : {}),
    ...(patch.tone !== undefined ? { tone: String(patch.tone) } : {}),
    ...(patch.rules !== undefined ? { rules: String(patch.rules) } : {})
  }
  getDb()
    .prepare('UPDATE series SET title = ?, premise = ?, bible_json = ?, updated_at = ? WHERE id = ?')
    .run(
      patch.title !== undefined ? String(patch.title).trim() || s.title : s.title,
      patch.premise !== undefined ? String(patch.premise) : s.premise,
      JSON.stringify(bible),
      Date.now(),
      id
    )
  return getSeries(id)
}

const TTS: TtsProvider[] = ['gemini', 'elevenlabs', 'ninerouter']

/** Project columns an episode setting is stored in (the series table uses the same names). */
const SETTING_COLUMNS: Record<keyof SeriesSettingsPatch, string> = {
  durationSec: 'duration_sec',
  language: 'language',
  aspectRatio: 'aspect_ratio',
  styleId: 'style_id',
  ttsProvider: 'tts_provider',
  ttsVoice: 'tts_voice',
  imageModel: 'image_model',
  templateId: 'template_id',
  theme: 'theme_json'
}

/** Only values the app can use; anything else in the patch is dropped. */
function cleanSettings(s: Series, patch: SeriesSettingsPatch): SeriesSettingsPatch {
  const out: SeriesSettingsPatch = {}
  if (Number.isFinite(patch.durationSec) && Number(patch.durationSec) >= 10) out.durationSec = Math.round(Number(patch.durationSec))
  if (patch.language && LANGUAGES.some((l) => l.code === patch.language)) out.language = patch.language
  if (patch.aspectRatio === '16:9' || patch.aspectRatio === '9:16') out.aspectRatio = patch.aspectRatio
  if (typeof patch.styleId === 'string' && s.kind === 'story') out.styleId = getStyle(patch.styleId).id
  if (patch.ttsProvider && TTS.includes(patch.ttsProvider)) out.ttsProvider = patch.ttsProvider
  if (typeof patch.ttsVoice === 'string' && patch.ttsVoice.trim()) out.ttsVoice = patch.ttsVoice.trim()
  if (typeof patch.imageModel === 'string' && patch.imageModel.trim()) out.imageModel = patch.imageModel.trim()
  if (s.kind === 'explainer') {
    if (typeof patch.templateId === 'string') out.templateId = getTemplate(patch.templateId).id
    if (patch.theme && typeof patch.theme === 'object') out.theme = parseTheme(JSON.stringify(patch.theme))
    // Palettes belong to one template, so a new template starts on its own first palette.
    else if (out.templateId && out.templateId !== s.templateId) out.theme = { ...s.theme, paletteId: undefined }
  }
  // A new provider needs a voice of its own when the caller did not pick one with it.
  if (out.ttsProvider && out.ttsProvider !== s.ttsProvider && !out.ttsVoice) out.ttsVoice = defaultTtsVoice(out.ttsProvider, out.language ?? s.language)
  return out
}

/**
 * Changes the settings new episodes start with, and gives the changed ones to the episodes that have no scenes
 * yet. Episodes that already have scenes keep their own settings: their pictures and voice were made with them.
 */
export function updateSeriesSettings(id: string, patch: SeriesSettingsPatch): SeriesSettingsResult {
  const s = getSeries(id)
  const clean = cleanSettings(s, patch ?? {})
  const fields = Object.keys(clean) as (keyof SeriesSettingsPatch)[]
  const db = getDb()
  const sets = fields.map((k) => `${SETTING_COLUMNS[k]} = ?`).join(', ')
  let applied = 0
  let kept = 0
  db.transaction(() => {
    if (fields.length)
      db.prepare(`UPDATE series SET ${sets}, updated_at = ? WHERE id = ?`).run(
        ...fields.map((k) => (k === 'theme' ? JSON.stringify(clean.theme ?? {}) : clean[k])),
        Date.now(),
        id
      )
    const rows = db
      .prepare('SELECT p.id, p.theme_json, (SELECT COUNT(*) FROM clips c WHERE c.project_id = p.id) AS clip_count FROM projects p WHERE p.series_id = ?')
      .all(id) as Row[]
    for (const r of rows) {
      if (r.clip_count > 0) {
        kept++
        continue
      }
      applied++
      if (!fields.length) continue
      // The episode keeps its own logo; that is one of its files.
      const logo = (JSON.parse(r.theme_json || '{}') as ExplainerTheme).logoAssetId
      db.prepare(`UPDATE projects SET ${sets}, updated_at = ? WHERE id = ?`).run(
        ...fields.map((k) => (k === 'theme' ? JSON.stringify({ ...clean.theme, ...(logo ? { logoAssetId: logo } : {}) }) : clean[k])),
        Date.now(),
        r.id
      )
    }
  })()
  return { bundle: getSeriesBundle(id), applied, kept }
}

/** Stores a bible written by the LLM. */
export function setSeriesBible(id: string, title: string, bible: SeriesBible, episodeCount: number): void {
  getDb()
    .prepare('UPDATE series SET title = ?, bible_json = ?, episode_count = ?, updated_at = ? WHERE id = ?')
    .run(title, JSON.stringify(bible), episodeCount, Date.now(), id)
}

/** Deletes the series with every episode project (rows and folders) and the series folder. */
export function removeSeries(id: string): void {
  for (const p of episodesOf(id)) removeProject(p.id)
  getDb().prepare('DELETE FROM series WHERE id = ?').run(id)
  const dir = join(seriesRoot(), id)
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
}

// ---------- cast ----------

/** Adds characters by name; known names keep their description and sheet. */
export function addSeriesCast(seriesId: string, cast: { name: string; description: string }[]): void {
  const db = getDb()
  db.transaction(() => {
    // A plan that names someone removed earlier brings them back on purpose.
    const removed = removedCast('series', seriesId)
    const count = removed.size
    for (const c of cast) removed.delete(key(c.name))
    if (removed.size !== count) setRemovedCast('series', seriesId, removed)
    const existing = db.prepare('SELECT id, name, description FROM series_characters WHERE series_id = ?').all(seriesId) as Row[]
    const byName = new Map(existing.map((c) => [key(c.name), c]))
    let sort = existing.length
    for (const c of cast) {
      const k = key(c.name)
      if (!k) continue
      const known = byName.get(k)
      if (known) {
        if (!String(known.description).trim() && c.description.trim())
          db.prepare('UPDATE series_characters SET description = ? WHERE id = ?').run(c.description.trim(), known.id)
        continue
      }
      const id = randomUUID()
      db.prepare('INSERT INTO series_characters (id, series_id, name, description, sort) VALUES (?, ?, ?, ?, ?)').run(
        id,
        seriesId,
        c.name.trim(),
        c.description.trim(),
        sort++
      )
      byName.set(k, { id, name: c.name, description: c.description })
    }
  })()
}

/** Characters without a sheet, which a new plan may replace; ones with a sheet are worth keeping. */
export function dropUnsheetedCast(seriesId: string): void {
  getDb().prepare('DELETE FROM series_characters WHERE series_id = ? AND sheet_path IS NULL').run(seriesId)
}

export function updateSeriesCharacter(id: string, patch: { name?: string; description?: string }): SeriesCharacter {
  const r = getDb().prepare('SELECT * FROM series_characters WHERE id = ?').get(id) as Row | undefined
  if (!r) throw new Error('Pemeran seri tidak ditemukan')
  const name = patch.name !== undefined ? String(patch.name).trim() || r.name : r.name
  const description = patch.description !== undefined ? String(patch.description) : r.description
  getDb().prepare('UPDATE series_characters SET name = ?, description = ? WHERE id = ?').run(name, description, id)
  if (key(name) !== key(r.name)) {
    // Episodes still know the old name; without this the next copy back would add it as a second character.
    const removed = removedCast('series', r.series_id)
    removed.add(key(r.name))
    removed.delete(key(name))
    setRemovedCast('series', r.series_id, removed)
  }
  return toSeriesCharacter({ ...r, name, description })
}

export function removeSeriesCharacter(id: string): void {
  const r = getDb().prepare('SELECT * FROM series_characters WHERE id = ?').get(id) as Row | undefined
  if (!r) return
  getDb().prepare('DELETE FROM series_characters WHERE id = ?').run(id)
  // Episodes that still have this character must not hand it back to the series.
  setRemovedCast('series', r.series_id, [...removedCast('series', r.series_id), key(r.name)])
  if (r.sheet_path) rmSync(sheetAbs(r.series_id, r.sheet_path), { force: true })
}

// ---------- episodes ----------

/**
 * A new episode project with the series' settings. A story episode gets the series cast right away; an explainer
 * episode gets the series template and look.
 */
export async function createEpisode(seriesId: string, ep: { no: number; title: string; synopsis: string }): Promise<string> {
  const s = getSeries(seriesId)
  const db = getDb()
  const id = db.transaction(() => {
    const p = createProject({
      synopsis: ep.synopsis,
      durationSec: s.durationSec,
      language: s.language,
      aspectRatio: s.aspectRatio,
      styleId: s.styleId,
      ttsProvider: s.ttsProvider,
      kind: s.kind,
      templateId: s.templateId ?? undefined
    })
    db.prepare(
      'UPDATE projects SET title = ?, tts_voice = ?, image_model = ?, video_model = ?, theme_json = ?, series_id = ?, episode_no = ? WHERE id = ?'
    ).run(episodeProjectTitle(ep.no, ep.title), s.ttsVoice, s.imageModel, s.videoModel, JSON.stringify(s.theme), seriesId, ep.no, p.id)
    return p.id
  })()
  if (s.kind === 'story') await syncCastIn(id, { addMissing: true })
  return id
}

export function updateEpisode(projectId: string, patch: { title?: string; synopsis?: string; summary?: string }): void {
  const p = getProject(projectId)
  if (!p.seriesId) throw new Error('Proyek ini bukan episode seri')
  const title = patch.title !== undefined ? episodeProjectTitle(p.episodeNo ?? 0, String(patch.title)) : p.title
  const synopsis = patch.synopsis !== undefined ? String(patch.synopsis) : p.synopsis
  const summary = patch.summary !== undefined ? String(patch.summary) : p.episodeSummary
  getDb()
    .prepare('UPDATE projects SET title = ?, synopsis = ?, episode_summary = ?, updated_at = ? WHERE id = ?')
    .run(title, synopsis, summary, Date.now(), projectId)
}

export function setEpisodeSummary(projectId: string, summary: string): void {
  getDb().prepare('UPDATE projects SET episode_summary = ? WHERE id = ?').run(summary, projectId)
}

/** Deletes one episode; later episodes move up a number so the order has no gap. */
export function removeEpisode(projectId: string): void {
  const p = getProject(projectId)
  if (!p.seriesId || p.episodeNo == null) return removeProject(projectId)
  const s = getSeries(p.seriesId)
  const removed = p.episodeNo
  removeProject(projectId)
  const db = getDb()
  db.transaction(() => {
    for (const e of episodesOf(s.id)) {
      if (e.episodeNo == null || e.episodeNo <= removed) continue
      db.prepare('UPDATE projects SET episode_no = ?, title = ? WHERE id = ?').run(e.episodeNo - 1, episodeProjectTitle(e.episodeNo - 1, e.title), e.id)
    }
    const hooks = s.bible.hooks.filter((h) => h.no !== removed).map((h) => (h.no > removed ? { ...h, no: h.no - 1 } : h))
    db.prepare('UPDATE series SET bible_json = ?, episode_count = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify({ ...s.bible, hooks }),
      episodesOf(s.id).length,
      Date.now(),
      s.id
    )
  })()
}

// ---------- copying the cast between the series and its episodes ----------

/**
 * Copies the series cast into an episode project. Each series sheet goes into the project as an image asset that
 * becomes the sheet of the episode's character with that name, so `generateMissingImages` reuses it instead of
 * drawing a new one. Characters the episode already has keep their description and their own sheet.
 *
 * Series characters the episode does not have are only added with `addMissing` (when the episode is created, and
 * before a one-click run writes its script or visual plan), and never one that was removed from the episode by
 * hand (`noteRemovedCast` in repo.ts). `restore` ("Ambil pemeran seri") forgets those removals and adds everyone.
 * Opening an episode only copies sheets, so a character deleted there stays deleted.
 */
export async function syncCastIn(projectId: string, opts: CastSyncOptions = {}): Promise<ProjectBundle> {
  const project = getProject(projectId)
  if (!project.seriesId || !sharesCast(project.seriesId)) return getBundle(projectId)
  if (opts.restore) setRemovedCast('projects', projectId, [])
  const addMissing = !!opts.addMissing || !!opts.restore
  const removed = removedCast('projects', projectId)
  const before = new Map(charactersOf(projectId).map((c) => [key(c.name), c]))
  const cast = seriesCast(project.seriesId).filter((sc) => before.has(key(sc.name)) || (addMissing && !removed.has(key(sc.name))))
  if (!cast.length) return getBundle(projectId)

  // Files first (probing is async); the rows then go in one transaction.
  const sheets = new Map<string, { rel: string; width: number | null; height: number | null }>()
  for (const sc of cast) {
    if (!sc.sheetPath) continue
    const own = before.get(key(sc.name))
    if (own?.sheetAssetId && getAsset(own.sheetAssetId)) continue
    const src = sheetAbs(project.seriesId, sc.sheetPath)
    const rel = `images/${randomUUID()}${extname(src).toLowerCase() || '.png'}`
    const abs = assetAbsPath(projectId, rel)
    mkdirSync(dirname(abs), { recursive: true })
    copyFileSync(src, abs)
    const size = await probeSize(abs).catch(() => null)
    sheets.set(sc.id, { rel, width: size?.width ?? null, height: size?.height ?? null })
  }

  const db = getDb()
  db.transaction(() => {
    const current = charactersOf(projectId)
    const byName = new Map(current.map((c) => [key(c.name), c.id]))
    let sort = current.length
    for (const sc of cast) {
      let charId = byName.get(key(sc.name))
      if (!charId) {
        charId = randomUUID()
        db.prepare('INSERT INTO characters (id, project_id, name, description, sort) VALUES (?, ?, ?, ?, ?)').run(
          charId,
          projectId,
          sc.name,
          sc.description,
          sort++
        )
        byName.set(key(sc.name), charId)
      }
      const sheet = sheets.get(sc.id)
      if (!sheet) continue
      const asset = insertAsset({
        projectId,
        characterId: charId,
        kind: 'image',
        provider: 'series',
        prompt: `Lembar karakter ${sc.name} dari seri`,
        localPath: sheet.rel,
        width: sheet.width,
        height: sheet.height
      })
      setCharacterSheet(charId, asset.id)
    }
  })()
  return getBundle(projectId)
}

/**
 * Copies what an episode added back to the series: new characters, and sheets for series characters that have
 * none yet. A series sheet that already exists is never replaced, so every episode keeps drawing from the same
 * reference.
 */
export function syncCastOut(projectId: string): SeriesBundle | null {
  const project = getProject(projectId)
  if (!project.seriesId) return null
  const seriesId = project.seriesId
  if (!sharesCast(seriesId)) return getSeriesBundle(seriesId)
  const removed = removedCast('series', seriesId)
  const db = getDb()
  const copySheet = (assetId: string | null): string | null => {
    const asset = getAsset(assetId)
    if (!asset || asset.kind !== 'image') return null
    const src = assetAbsPath(asset.projectId, asset.localPath)
    if (!existsSync(src)) return null
    const rel = `sheets/${randomUUID()}${extname(src).toLowerCase() || '.png'}`
    const dest = join(seriesDir(seriesId), rel)
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(src, dest)
    return rel
  }
  db.transaction(() => {
    const cast = seriesCast(seriesId)
    const byName = new Map(cast.map((c) => [key(c.name), c]))
    let sort = cast.length
    for (const c of charactersOf(projectId)) {
      const k = key(c.name)
      if (!k) continue
      const known = byName.get(k)
      if (!known) {
        if (removed.has(k)) continue
        const id = randomUUID()
        db.prepare('INSERT INTO series_characters (id, series_id, name, description, sheet_path, sort) VALUES (?, ?, ?, ?, ?, ?)').run(
          id,
          seriesId,
          c.name.trim(),
          c.description,
          copySheet(c.sheetAssetId),
          sort++
        )
        continue
      }
      if (!known.sheetPath) {
        const rel = copySheet(c.sheetAssetId)
        if (rel) db.prepare('UPDATE series_characters SET sheet_path = ? WHERE id = ?').run(rel, known.id)
      }
      if (!known.description.trim() && c.description.trim())
        db.prepare('UPDATE series_characters SET description = ? WHERE id = ?').run(c.description, known.id)
    }
    db.prepare('UPDATE series SET updated_at = ? WHERE id = ?').run(Date.now(), seriesId)
  })()
  return getSeriesBundle(seriesId)
}
