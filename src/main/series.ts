import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { episodeProjectTitle } from '@shared/series'
import type {
  NewSeriesInput,
  Project,
  ProjectBundle,
  Series,
  SeriesBible,
  SeriesBundle,
  SeriesCharacter,
  SeriesEpisode,
  SeriesPatch,
  SeriesSummary
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
 */

type Row = Record<string, any>

const EMPTY_BIBLE: SeriesBible = { world: '', tone: '', rules: '', hooks: [] }

function toSeries(r: Row): Series {
  const bible = JSON.parse(r.bible_json || '{}') as Partial<SeriesBible>
  return {
    id: r.id,
    kind: 'story',
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

const key = (name: string): string => name.trim().toLowerCase()

// ---------- series ----------

export function createSeries(input: NewSeriesInput): Series {
  const s = getSettings()
  const now = Date.now()
  const id = randomUUID()
  getDb()
    .prepare(
      `INSERT INTO series (id, kind, title, premise, continuity, bible_json, episode_count, duration_sec, language, aspect_ratio,
         style_id, tts_provider, tts_voice, image_model, video_model, created_at, updated_at)
       VALUES (?, 'story', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
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
  const rows = getDb()
    .prepare(
      `SELECT p.id, p.title, p.synopsis, p.episode_no, p.episode_summary, p.status, p.step, p.updated_at,
        (SELECT COUNT(*) FROM clips c WHERE c.project_id = p.id) AS clip_count,
        (SELECT COALESCE(SUM(duration_ms), 0) FROM clips c WHERE c.project_id = p.id) AS total_ms,
        (SELECT a.local_path FROM assets a WHERE a.id = p.cover_asset_id) AS cover_path
       FROM projects p WHERE p.series_id = ? ORDER BY p.episode_no, p.created_at`
    )
    .all(id) as Row[]
  const episodes: SeriesEpisode[] = rows.map((r) => ({
    id: r.id,
    no: r.episode_no ?? 0,
    title: r.title,
    synopsis: r.synopsis,
    summary: r.episode_summary ?? '',
    status: r.status,
    step: r.step,
    clipCount: r.clip_count,
    totalMs: r.total_ms,
    coverUrl: r.cover_path ? assetUrl(r.id, r.cover_path) : null,
    updatedAt: r.updated_at
  }))
  return { series: getSeries(id), characters: seriesCast(id), episodes }
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
      return {
        id: r.id,
        title: r.title,
        continuity: r.continuity === 'anthology' ? ('anthology' as const) : ('serial' as const),
        styleId: r.style_id,
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
  return toSeriesCharacter({ ...r, name, description })
}

export function removeSeriesCharacter(id: string): void {
  const r = getDb().prepare('SELECT * FROM series_characters WHERE id = ?').get(id) as Row | undefined
  if (!r) return
  getDb().prepare('DELETE FROM series_characters WHERE id = ?').run(id)
  if (r.sheet_path) rmSync(sheetAbs(r.series_id, r.sheet_path), { force: true })
}

// ---------- episodes ----------

/** A new episode project with the series' settings. The cast is copied in right away. */
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
      ttsProvider: s.ttsProvider
    })
    db.prepare(
      'UPDATE projects SET title = ?, tts_voice = ?, image_model = ?, video_model = ?, series_id = ?, episode_no = ? WHERE id = ?'
    ).run(episodeProjectTitle(ep.no, ep.title), s.ttsVoice, s.imageModel, s.videoModel, seriesId, ep.no, p.id)
    return p.id
  })()
  await syncCastIn(id)
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
 * Copies the series cast into an episode project: missing characters by name, and each series sheet into the
 * project as an image asset that becomes the character's sheet, so `generateMissingImages` reuses it instead of
 * drawing a new one. Characters the episode already has keep their description and their own sheet.
 */
export async function syncCastIn(projectId: string): Promise<ProjectBundle> {
  const project = getProject(projectId)
  if (!project.seriesId) return getBundle(projectId)
  const cast = seriesCast(project.seriesId)
  if (!cast.length) return getBundle(projectId)

  // Files first (probing is async); the rows then go in one transaction.
  const before = new Map(charactersOf(projectId).map((c) => [key(c.name), c]))
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
