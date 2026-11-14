import { randomUUID } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { NARRATOR_GRID } from '@shared/narrator'
import { NARRATOR_PRESETS, type NarratorPreset } from '@shared/narratorPresets'
import type { Narrator } from '@shared/types'
import { getDb } from './db'
import { narratorDir, narratorFileUrl, narratorPresetDir, narratorPresetFileUrl } from './paths'

type Row = Record<string, any>

export interface NarratorPatch {
  name?: string
  description?: string
  style?: Narrator['style']
}

/** Sprite and thumbnail URLs of whatever files exist in a folder; null when no sprite is there yet. */
function filesOf(dir: string, url: (file: string) => string): Pick<Narrator, 'spriteUrls' | 'thumbUrl'> {
  const spriteUrls: Record<string, string> = {}
  for (const { expression, mouth } of NARRATOR_GRID) {
    const key = `${expression}-${mouth}`
    if (existsSync(join(dir, `${key}.png`))) spriteUrls[key] = url(`${key}.png`)
  }
  return {
    spriteUrls: Object.keys(spriteUrls).length ? spriteUrls : null,
    thumbUrl: existsSync(join(dir, 'thumb.png')) ? url('thumb.png') : null
  }
}

function cleanStyle(s: unknown): Narrator['style'] {
  const o = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>
  return { kind: o.kind === 'explainer' ? 'explainer' : 'story', id: typeof o.id === 'string' ? o.id : '' }
}

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
    .run(id, cleanName(input?.name, 'Narator baru'), String(input?.description ?? '').trim(), style.kind, style.id, Date.now())
  return getNarrator(id)
}

export function updateNarrator(id: string, patch: NarratorPatch): Narrator {
  const cur = getNarrator(id)
  if (cur.preset) throw new Error('Narator bawaan tidak bisa diubah. Duplikat dulu kalau mau mengubahnya.')
  const style = patch?.style ? cleanStyle(patch.style) : cur.style
  getDb()
    .prepare('UPDATE narrators SET name = ?, description = ?, style_kind = ?, style_id = ? WHERE id = ?')
    .run(cleanName(patch?.name, cur.name), patch?.description !== undefined ? String(patch.description).trim() : cur.description, style.kind, style.id, id)
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
  mkdirSync(narratorDir(newId), { recursive: true })
  if (existsSync(from)) cpSync(from, narratorDir(newId), { recursive: true })
  getDb()
    .prepare('INSERT INTO narrators (id, name, description, style_kind, style_id, key_color, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(newId, `${src.name} (salinan)`.slice(0, 60), src.description, src.style.kind, src.style.id, src.keyColor, src.status, Date.now())
  return getNarrator(newId)
}
