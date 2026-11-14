import { randomUUID } from 'node:crypto'
import { cpSync, existsSync, statSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EXPLAINER_IMAGE_STYLES } from '@shared/explainer'
import { NARRATOR_GRID } from '@shared/narrator'
import { NARRATOR_PRESETS, type NarratorPreset } from '@shared/narratorPresets'
import { VISUAL_STYLES } from '@shared/styles'
import type { Job, Narrator } from '@shared/types'
import { getDb } from './db'
import { emit } from './events'
import { drawImage, imageQueue } from './generation'
import { runJob } from './jobs'
import type { updateJob } from './repo'
import { narratorDir, narratorFileUrl, narratorPresetDir, narratorPresetFileUrl } from './paths'
import { buildSheetPrompt, processSheet, sheetToPng, type SheetResult } from './narratorSprites'

type Row = Record<string, any>

export interface NarratorPatch {
  name?: string
  description?: string
  style?: Narrator['style']
}

/** Sprite and thumbnail URLs of whatever files exist in a folder; null when no sprite is there yet. */
function filesOf(dir: string, url: (file: string) => string): Pick<Narrator, 'spriteUrls' | 'thumbUrl'> {
  // The URL of a file never changes when "Buat ulang" rewrites it, so Chromium would keep serving the cached old
  // picture; the mtime in the query makes a rewritten sprite a new URL (the protocol handlers read only the path).
  const versioned = (file: string): string | null => {
    try {
      return `${url(file)}?v=${Math.round(statSync(join(dir, file)).mtimeMs)}`
    } catch {
      return null
    }
  }
  const spriteUrls: Record<string, string> = {}
  for (const { expression, mouth } of NARRATOR_GRID) {
    const key = `${expression}-${mouth}`
    const u = versioned(`${key}.png`)
    if (u) spriteUrls[key] = u
  }
  return {
    spriteUrls: Object.keys(spriteUrls).length ? spriteUrls : null,
    thumbUrl: versioned('thumb.png')
  }
}

/** Same cap as Magic's description box, so a generated description always fits. */
const MAX_DESCRIPTION = 600

/** A style the generator cannot resolve would silently fall back to the first one, so unknown ids are refused. */
function cleanStyle(s: unknown): Narrator['style'] {
  const o = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>
  const kind = o.kind === 'explainer' ? 'explainer' : 'story'
  const id = typeof o.id === 'string' ? o.id : ''
  const known = kind === 'explainer' ? EXPLAINER_IMAGE_STYLES.some((x) => x.id === id) : VISUAL_STYLES.some((x) => x.id === id)
  if (!known) throw new Error('Gaya gambar narator tidak dikenal.')
  return { kind, id }
}

const cleanDescription = (s: unknown): string => String(s ?? '').trim().slice(0, MAX_DESCRIPTION)

function toNarrator(r: Row): Narrator {
  const ready = r.status === 'ready'
  const files = ready ? filesOf(narratorDir(r.id), (f) => narratorFileUrl(r.id, f)) : { spriteUrls: null, thumbUrl: null }
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    style: { kind: r.style_kind === 'explainer' ? 'explainer' : 'story', id: r.style_id },
    keyColor: r.key_color === '#FF00FF' ? '#FF00FF' : '#00FF00',
    preset: false,
    status: ready ? 'ready' : 'empty',
    ...files,
    createdAt: r.created_at
  }
}

/** A preset exists for the user only when its sprites were bundled with the app. */
function presetNarrator(p: NarratorPreset): Narrator | null {
  const dir = narratorPresetDir(p.id)
  if (!existsSync(dir)) return null
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    style: p.style,
    keyColor: p.keyColor,
    preset: true,
    status: 'ready',
    ...filesOf(dir, (f) => narratorPresetFileUrl(p.id, f)),
    createdAt: 0
  }
}

/** Presets with bundled art first, then the user's own, newest first. */
export function listNarrators(): Narrator[] {
  const presets = NARRATOR_PRESETS.map(presetNarrator).filter((n): n is Narrator => n !== null)
  const own = (getDb().prepare('SELECT * FROM narrators ORDER BY created_at DESC').all() as Row[]).map(toNarrator)
  return [...presets, ...own]
}

export function getNarrator(id: string): Narrator {
  const preset = NARRATOR_PRESETS.find((p) => p.id === id)
  if (preset) {
    const n = presetNarrator(preset)
    if (n) return n
  }
  const r = getDb().prepare('SELECT * FROM narrators WHERE id = ?').get(id) as Row | undefined
  if (!r) throw new Error('Narator tidak ditemukan')
  return toNarrator(r)
}

/** Null for an id that no longer exists; consumers treat that as "no narrator". */
export function findNarrator(id: string | null): Narrator | null {
  if (!id) return null
  try {
    return getNarrator(id)
  } catch {
    return null
  }
}

const cleanName = (s: unknown, fallback: string): string => (typeof s === 'string' && s.trim() ? s.trim().slice(0, 60) : fallback)

export function createNarrator(input: { name: string; description: string; style: Narrator['style'] }): Narrator {
  const id = randomUUID()
  const style = cleanStyle(input?.style)
  getDb()
    .prepare('INSERT INTO narrators (id, name, description, style_kind, style_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, cleanName(input?.name, 'Narator baru'), cleanDescription(input?.description), style.kind, style.id, Date.now())
  return getNarrator(id)
}

export function updateNarrator(id: string, patch: NarratorPatch): Narrator {
  const cur = getNarrator(id)
  if (cur.preset) throw new Error('Narator bawaan tidak bisa diubah. Duplikat dulu kalau mau mengubahnya.')
  const style = patch?.style ? cleanStyle(patch.style) : cur.style
  getDb()
    .prepare('UPDATE narrators SET name = ?, description = ?, style_kind = ?, style_id = ? WHERE id = ?')
    .run(cleanName(patch?.name, cur.name), patch?.description !== undefined ? cleanDescription(patch.description) : cur.description, style.kind, style.id, id)
  return getNarrator(id)
}

/** For the sprite generator, once the sheet has been cut into sprites (or wiped). */
export function setNarratorStatus(id: string, status: 'empty' | 'ready'): void {
  getDb().prepare('UPDATE narrators SET status = ? WHERE id = ?').run(status, id)
}

export function removeNarrator(id: string): void {
  const cur = getNarrator(id)
  if (cur.preset) throw new Error('Narator bawaan tidak bisa dihapus.')
  getDb().prepare('DELETE FROM narrators WHERE id = ?').run(id)
  const dir = narratorDir(id)
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
}

/** A user copy with its own sprite files; copying a preset is how its look gets customised. */
export function duplicateNarrator(id: string): Narrator {
  const src = getNarrator(id)
  const newId = randomUUID()
  const from = src.preset ? narratorPresetDir(src.id) : narratorDir(src.id)
  // The row goes in first: if the insert fails there is no folder to orphan, and if the copy fails the row is undone.
  getDb()
    .prepare('INSERT INTO narrators (id, name, description, style_kind, style_id, key_color, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(newId, `${src.name} (salinan)`.slice(0, 60), src.description, src.style.kind, src.style.id, src.keyColor, src.status, Date.now())
  try {
    mkdirSync(narratorDir(newId), { recursive: true })
    if (existsSync(from)) cpSync(from, narratorDir(newId), { recursive: true })
  } catch (e) {
    getDb().prepare('DELETE FROM narrators WHERE id = ?').run(newId)
    rmSync(narratorDir(newId), { recursive: true, force: true })
    throw e
  }
  return getNarrator(newId)
}

/**
 * Cuts a finished sheet into the narrator's sprites. The sheet is kept as `sheet.png` only when it was good, so a
 * failed regenerate leaves the previous sprites and sheet untouched.
 */
export async function applySheet(id: string, sheetPath: string): Promise<SheetResult> {
  const cur = getNarrator(id)
  if (cur.preset) throw new Error('Narator bawaan tidak bisa dibuat ulang. Duplikat dulu.')
  const dir = narratorDir(id)
  const r = await processSheet(sheetPath, dir, cur.keyColor)
  if (!r.ok) return r
  if (!findNarrator(id)) {
    // Removed while the sprites were being cut.
    rmSync(dir, { recursive: true, force: true })
    return { ok: false, reason: 'Narator sudah dihapus.' }
  }
  // Always PNG: the image model may hand back a jpeg or webp. The folder exists now because processSheet made it.
  await sheetToPng(sheetPath, join(dir, 'sheet.png'))
  setNarratorStatus(id, 'ready')
  return r
}

// Generation jobs belong to no project, so they live in memory (see runJob) and are told apart by `characterId`,
// which carries the narrator id.
const jobStore = new Map<string, Job>()
const activeByNarrator = new Map<string, string>()

function updateLoose(jobId: string, patch: Parameters<typeof updateJob>[1]): Job {
  const cur = jobStore.get(jobId)!
  // The remote id is tracked by runJob for cancelling; the Job shape has no field for it.
  const { remoteId: _remote, ...rest } = patch
  const next: Job = { ...cur, ...rest, updatedAt: Date.now() }
  jobStore.set(jobId, next)
  return next
}

/** The sheet job that is queued or running for this narrator, so a dialog opened mid-run can show its progress. */
export function activeNarratorJob(id: string): Job | null {
  const jobId = activeByNarrator.get(id)
  return (jobId && jobStore.get(jobId)) || null
}

/** Draws a new sprite sheet with the image model in settings and cuts it. One run per narrator at a time. */
export function generateNarrator(id: string): Job {
  const cur = getNarrator(id)
  if (cur.preset) throw new Error('Narator bawaan tidak bisa dibuat ulang. Duplikat dulu.')
  const running = activeByNarrator.get(id)
  if (running) return jobStore.get(running)!
  const now = Date.now()
  const job: Job = {
    id: randomUUID(),
    projectId: '',
    clipId: null,
    characterId: id,
    kind: 'sheet',
    provider: imageQueue(),
    status: 'queued',
    progress: 0,
    message: null,
    error: null,
    resultAssetId: null,
    createdAt: now,
    updatedAt: now
  }
  jobStore.set(job.id, job)
  activeByNarrator.set(id, job.id)
  emit.job(job)
  const done = (): void => {
    activeByNarrator.delete(id)
  }
  return runJob(
    job,
    imageQueue(),
    async (ctx) => {
      ctx.progress(0.04, 'Menyiapkan prompt')
      const image = await drawImage(ctx, buildSheetPrompt(getNarrator(id)), '16:9', 'Membuat lembar ekspresi')
      // Removed while the picture was being drawn: drop the result and leave no folder behind.
      if (!findNarrator(id)) return
      ctx.progress(0.95, 'Memotong sprite')
      const work = mkdtempSync(join(tmpdir(), 'narrator-sheet-'))
      const tmp = join(work, `sheet-new${image.ext || '.png'}`)
      try {
        writeFileSync(tmp, image.bytes)
        const r = await applySheet(id, tmp)
        if (!r.ok) throw new Error(r.reason)
      } finally {
        rmSync(work, { recursive: true, force: true })
      }
    },
    (jobId, patch) => {
      const j = updateLoose(jobId, patch)
      if (j.status !== 'queued' && j.status !== 'running') {
        done()
        // runJob emits the returned job right after this call; the entry is no longer needed once that has happened.
        setTimeout(() => jobStore.delete(jobId), 1000)
      }
      return j
    }
  )
}

/** Absolute sprite files by key ("happy-open"), for the export; null while the narrator has no sprites. */
export function narratorSpriteFiles(n: Narrator): Record<string, string> | null {
  if (!n.spriteUrls) return null
  const dir = n.preset ? narratorPresetDir(n.id) : narratorDir(n.id)
  const out: Record<string, string> = {}
  for (const key of Object.keys(n.spriteUrls)) out[key] = join(dir, `${key}.png`)
  return out
}
