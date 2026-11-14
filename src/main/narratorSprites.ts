import { execFile } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nativeImage } from 'electron'
import ffmpegStatic from 'ffmpeg-static'
import { NARRATOR_GRID } from '@shared/narrator'
import { getExplainerImageStyle } from '@shared/explainer'
import { getStyle } from '@shared/styles'
import type { Narrator, NarratorExpression } from '@shared/types'
import { binPath } from './paths'

export const SHEET_COLS = 4
export const SHEET_ROWS = 3
export const BAD_SHEET_MESSAGE = 'Lembar ekspresi tidak rapi. Coba buat ulang.'

// Inner margin per cell: image models never draw exactly on the grid, and this keeps a neighbour's edge out.
const CELL_MARGIN = 0.03
// Chroma key strength and soft edge for ffmpeg's chromakey.
const KEY_SIMILARITY = 0.12
const KEY_BLEND = 0.06
// A pixel counts as sprite when it is at least this opaque (0-255).
const SOLID_ALPHA = 8
const MIN_COVER = 0.05
const MAX_COVER = 0.95
const EDGE_TOUCH_PX = 2
// A connected piece smaller than this share of the biggest one is a speck, not subject.
const SUBJECT_PART = 0.02
const THUMB_SIZE = 256
// Space left around the shared canvas so a bounce or breath scale never clips the sprite.
const CANVAS_PAD = 0.02

const EXPRESSION_HINT: Record<NarratorExpression, string> = {
  neutral: 'neutral, calm relaxed face',
  happy: 'happy, warm smile, bright eyes',
  sad: 'sad, drooping brows, downcast eyes',
  surprised: 'surprised, wide eyes, raised brows',
  serious: 'serious, firm focused look, level brows',
  thinking: 'thinking, one brow raised, eyes glancing up and sideways'
}

const KEY_NAME: Record<Narrator['keyColor'], string> = { '#00FF00': 'pure green', '#FF00FF': 'pure magenta' }

/** The style line of the narrator's chosen look, in the same words the project's own pictures use. */
function styleLine(n: Narrator): string {
  if (n.style.kind === 'story') {
    const s = getStyle(n.style.id)
    return `${s.prompt}\nThe character is ${s.characterHint}.`
  }
  // 'auto' has no prompt of its own: explainer pictures then follow the template, so pick a neutral clean look.
  return getExplainerImageStyle(n.style.id).prompt || 'Clean modern flat illustration, soft shading, simple shapes.'
}

/**
 * The prompt for one 4x3 sheet. Cell order is NARRATOR_GRID, so the cutter and the prompt cannot disagree about
 * which cell holds which sprite. Style prompts often mention a background, hence the explicit override.
 */
export function buildSheetPrompt(n: Narrator): string {
  const key = n.keyColor
  const cells = NARRATOR_GRID.map(
    ({ expression, mouth }, i) =>
      `${i + 1}. ${EXPRESSION_HINT[expression]}, mouth ${mouth === 'open' ? 'open as if saying "ah"' : 'closed, lips together'}`
  ).join('\n')
  return [
    styleLine(n),
    `Expression sheet of ONE video narrator character: ${n.description.trim() || 'a friendly presenter'}.`,
    `Layout: a single image divided into an exact grid of ${SHEET_COLS} columns by ${SHEET_ROWS} rows, 12 cells of identical size, filled in reading order (left to right, top to bottom):\n${cells}`,
    'Every cell shows the SAME character, half-body (head, shoulders and upper chest), facing the camera. The head and shoulders sit at exactly the same position, size and angle in every cell; only the face changes. Keep the figure well inside its cell with empty background around it; nothing crosses a cell border except the flat cut at the bottom of each bust.',
    `Background (this overrides any background instruction above): one perfectly flat solid ${KEY_NAME[key]} (${key}) color covering the whole image, including the gaps between cells. No gradient, no shadow, no floor, no vignette, no glow. The character must not use ${KEY_NAME[key]} anywhere (clothes, eyes, accessories, highlights). Crisp clean outlines.`,
    'No text, letters, numbers, labels, borders or grid lines anywhere.'
  ].join('\n\n')
}

function ffmpeg(args: string[]): Promise<void> {
  if (!ffmpegStatic) return Promise.reject(new Error('FFmpeg tidak ditemukan di aplikasi'))
  return new Promise((resolve, reject) => {
    execFile(binPath(ffmpegStatic!), ['-hide_banner', '-nostats', '-loglevel', 'error', '-y', ...args], { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, _out, stderr) => {
      if (err) reject(new Error(`FFmpeg gagal: ${String(stderr).split('\n').slice(-4).join(' ').trim()}`))
      else resolve()
    })
  })
}

/**
 * Crop and key chain for one cell: `keyed` keeps the true colors, `spill` also has the key color despilled. Keying
 * runs in 4:4:4 (the default 4:2:0 smears chroma over 2x2 pixels and leaves a colored halo). Magenta is keyed as
 * green on the negated picture, because ffmpeg's despill only knows green and blue screens; the final negate
 * restores the real colors. Despill is global and shifts any subject color that leans toward the key (teal,
 * yellow), so only the edge pixels take from `spill` (see cleanEdges); the interior comes from `keyed`.
 */
function cellFilter(i: number, crop: string, key: Narrator['keyColor']): string {
  const neg = key === '#FF00FF'
  const pre = neg ? `${crop},format=rgba,negate` : crop
  const post = neg ? ',format=rgba,negate' : ',format=rgba'
  return (
    `[s${i}]${pre},format=yuva444p,chromakey=0x00FF00:${KEY_SIMILARITY}:${KEY_BLEND},split[k${i}][d${i}];` +
    `[k${i}]${post.slice(1)}[o${i}];` +
    `[d${i}]format=gbrap,despill=type=green:mix=0.5:expand=0.1${post}[p${i}]`
  )
}

interface Cut {
  w: number
  h: number
  /** Premultiplied BGRA straight from nativeImage.toBitmap. */
  px: Buffer
  /** The same cell with the key color despilled everywhere; only used for edge pixels. */
  spill: Buffer
  box: { x0: number; y0: number; x1: number; y1: number }
  cover: number
  touches: number
  spills: boolean
}

function measure(png: Buffer, spillPng: Buffer): Cut {
  const img = nativeImage.createFromBuffer(png)
  const { width: w, height: h } = img.getSize()
  const px = img.toBitmap()
  const spill = nativeImage.createFromBuffer(spillPng).toBitmap()
  let solid = 0
  const mask = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) {
    if (px[i * 4 + 3] >= SOLID_ALPHA) {
      mask[i] = 1
      solid++
    }
  }
  // Stray specks must not move the box: it spans the connected pieces that are a real part of the subject, i.e. at
  // least SUBJECT_PART of the biggest piece (a floating hand still counts, a 2px dot does not).
  const comps: { size: number; x0: number; y0: number; x1: number; y1: number }[] = []
  const stack = new Int32Array(w * h)
  for (let start = 0; start < w * h; start++) {
    if (mask[start] !== 1) continue
    let sp = 0
    stack[sp++] = start
    mask[start] = 2
    const c = { size: 0, x0: w, y0: h, x1: -1, y1: -1 }
    while (sp > 0) {
      const i = stack[--sp]
      const x = i % w
      const y = (i - x) / w
      c.size++
      if (x < c.x0) c.x0 = x
      if (x > c.x1) c.x1 = x
      if (y < c.y0) c.y0 = y
      if (y > c.y1) c.y1 = y
      if (x > 0 && mask[i - 1] === 1) (mask[i - 1] = 2), (stack[sp++] = i - 1)
      if (x < w - 1 && mask[i + 1] === 1) (mask[i + 1] = 2), (stack[sp++] = i + 1)
      if (y > 0 && mask[i - w] === 1) (mask[i - w] = 2), (stack[sp++] = i - w)
      if (y < h - 1 && mask[i + w] === 1) (mask[i + w] = 2), (stack[sp++] = i + w)
    }
    comps.push(c)
  }
  const biggest = Math.max(0, ...comps.map((c) => c.size))
  const parts = comps.filter((c) => c.size >= biggest * SUBJECT_PART)
  const x0 = parts.length ? Math.min(...parts.map((c) => c.x0)) : -1
  const x1 = parts.length ? Math.max(...parts.map((c) => c.x1)) : -1
  const y0 = parts.length ? Math.min(...parts.map((c) => c.y0)) : -1
  const y1 = parts.length ? Math.max(...parts.map((c) => c.y1)) : -1
  const ok = x0 >= 0 && y0 >= 0
  const top = ok && y0 < EDGE_TOUCH_PX
  const left = ok && x0 < EDGE_TOUCH_PX
  const right = ok && x1 >= w - EDGE_TOUCH_PX
  const bottom = ok && y1 >= h - EDGE_TOUCH_PX
  // A bust is cut flat at the bottom and may have shoulders wide enough to reach both sides, so only a subject that
  // also reaches the top (and another side) clearly spills out of its cell.
  const spills = top && Number(left) + Number(right) + Number(bottom) >= 2
  const touches = Number(top) + Number(left) + Number(right) + Number(bottom)
  return { w, h, px, spill, box: { x0: Math.max(0, x0), y0: Math.max(0, y0), x1: Math.max(0, x1), y1: Math.max(0, y1) }, cover: solid / (w * h), touches, spills }
}

const FILL_RADIUS = 3

/**
 * Recolors the soft edge of a sprite. Pixels the key left partly transparent still carry a mix of subject and key
 * color (a green rim, or a dark one once the green is stripped), so each takes the color of the nearest fully
 * opaque pixels that sit at least one pixel inside the shape; only its alpha is kept. A stroke too thin to have
 * such neighbours falls back to the despilled pixel with the leftover key component subtracted.
 * Works on premultiplied data.
 */
function cleanEdges(c: Cut, key: Narrator['keyColor']): void {
  const { w, h, px, spill } = c
  const alphaAt = (x: number, y: number): number => px[(y * w + x) * 4 + 3]
  const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h
  const solid = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (alphaAt(x, y) !== 255) continue
      let all = true
      for (let dy = -1; dy <= 1 && all; dy++) for (let dx = -1; dx <= 1; dx++) if (inside(x + dx, y + dy) && alphaAt(x + dx, y + dy) !== 255) all = false
      solid[y * w + x] = all ? 1 : 0
    }
  }
  const out = Buffer.from(px)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4
      const alpha = px[o + 3]
      if (alpha === 0 || solid[y * w + x]) continue
      let sb = 0
      let sg = 0
      let sr = 0
      let n = 0
      for (let r = 1; r <= FILL_RADIUS && n === 0; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !inside(x + dx, y + dy) || !solid[(y + dy) * w + x + dx]) continue
            const q = ((y + dy) * w + x + dx) * 4
            sb += px[q]
            sg += px[q + 1]
            sr += px[q + 2]
            n++
          }
        }
      }
      if (n > 0) {
        out[o] = Math.round((sb / n) * (alpha / 255))
        out[o + 1] = Math.round((sg / n) * (alpha / 255))
        out[o + 2] = Math.round((sr / n) * (alpha / 255))
        continue
      }
      let b = spill[o]
      let g = spill[o + 1]
      let r = spill[o + 2]
      if (key === '#00FF00') g -= Math.max(0, g - Math.max(r, b))
      else {
        const excess = Math.max(0, Math.min(r, b) - g)
        b -= excess
        r -= excess
      }
      out[o] = b
      out[o + 1] = g
      out[o + 2] = r
    }
  }
  out.copy(px)
}

function toPng(w: number, h: number, bitmap: Buffer): Buffer {
  return nativeImage.createFromBitmap(bitmap, { width: w, height: h }).toPNG()
}

/** Square thumbnail: the whole sprite, centered, on a transparent square. */
function makeThumb(w: number, h: number, bitmap: Buffer): Buffer {
  const side = Math.max(w, h)
  const sq = Buffer.alloc(side * side * 4)
  const ox = Math.floor((side - w) / 2)
  const oy = Math.floor((side - h) / 2)
  for (let y = 0; y < h; y++) bitmap.copy(sq, ((y + oy) * side + ox) * 4, y * w * 4, (y + 1) * w * 4)
  return nativeImage.createFromBitmap(sq, { width: side, height: side }).resize({ width: THUMB_SIZE, height: THUMB_SIZE, quality: 'best' }).toPNG()
}

/** Any image ffmpeg can read to PNG; the sheet is kept this way so it never depends on the model's format. */
export function sheetToPng(from: string, to: string): Promise<void> {
  return ffmpeg(['-i', from, '-frames:v', '1', to])
}

export type SheetResult = { ok: true } | { ok: false; reason: string; detail?: string }

const bad = (detail: string): SheetResult => ({ ok: false, reason: BAD_SHEET_MESSAGE, detail })

/**
 * Cuts a sheet into the 12 sprites and a thumbnail inside `outDir`. Either everything is written or nothing is:
 * the sheet is judged in memory first, so a broken sheet never replaces sprites that already work.
 */
export async function processSheet(sheetPath: string, outDir: string, keyColor: Narrator['keyColor']): Promise<SheetResult> {
  const work = mkdtempSync(join(tmpdir(), 'narrator-'))
  try {
    // Chromium cannot decode WebP from a path (it reports 0x0), so ffmpeg normalises whatever the model returned.
    const src = join(work, 'sheet.png')
    await sheetToPng(sheetPath, src).catch(() => undefined)
    const { width: sw, height: sh } = nativeImage.createFromPath(src).getSize()
    if (sw === 0 || sh === 0) return bad('format gambar lembar tidak bisa dibaca')
    if (sw < SHEET_COLS * 60 || sh < SHEET_ROWS * 60) return bad(`lembar terlalu kecil (${sw}x${sh})`)
    const cw = Math.floor(sw / SHEET_COLS)
    const ch = Math.floor(sh / SHEET_ROWS)
    const mx = Math.round(cw * CELL_MARGIN)
    const my = Math.round(ch * CELL_MARGIN)
    const iw = cw - 2 * mx
    const ih = ch - 2 * my
    // One process cuts all 12 cells: one decode of the sheet instead of twelve.
    const n = NARRATOR_GRID.length
    const chains = NARRATOR_GRID.map((_, i) => {
      const x = (i % SHEET_COLS) * cw + mx
      const y = Math.floor(i / SHEET_COLS) * ch + my
      return cellFilter(i, `crop=${iw}:${ih}:${x}:${y}`, keyColor)
    })
    const graph = `[0:v]split=${n}${NARRATOR_GRID.map((_, i) => `[s${i}]`).join('')};${chains.join(';')}`
    const args = ['-i', src, '-filter_complex', graph]
    NARRATOR_GRID.forEach((_, i) => {
      args.push('-map', `[o${i}]`, '-frames:v', '1', join(work, `cell-${i}.png`))
      args.push('-map', `[p${i}]`, '-frames:v', '1', join(work, `spill-${i}.png`))
    })
    await ffmpeg(args)

    const cuts = NARRATOR_GRID.map((_, i) => measure(readFileSync(join(work, `cell-${i}.png`)), readFileSync(join(work, `spill-${i}.png`))))
    for (const [i, c] of cuts.entries()) {
      const name = `${NARRATOR_GRID[i].expression}-${NARRATOR_GRID[i].mouth}`
      if (c.cover < MIN_COVER) return bad(`sel ${i + 1} (${name}) kosong, alfa ${(c.cover * 100).toFixed(1)}%`)
      if (c.cover > MAX_COVER) return bad(`sel ${i + 1} (${name}) terisi penuh, alfa ${(c.cover * 100).toFixed(1)}%`)
      if (c.spills) return bad(`sel ${i + 1} (${name}) keluar dari sel (menyentuh ${c.touches} sisi)`)
    }
    cuts.forEach((c) => cleanEdges(c, keyColor))

    // Shared canvas: centre every sprite on the average centre and sit it on the average bottom edge, so a swap
    // between two expressions never makes the narrator jump.
    const cx = cuts.reduce((s, c) => s + (c.box.x0 + c.box.x1) / 2, 0) / n
    const by = cuts.reduce((s, c) => s + c.box.y1, 0) / n
    const shift = cuts.map((c) => ({ dx: Math.round(cx - (c.box.x0 + c.box.x1) / 2), dy: Math.round(by - c.box.y1) }))
    const minX = Math.min(...cuts.map((c, i) => c.box.x0 + shift[i].dx))
    const maxX = Math.max(...cuts.map((c, i) => c.box.x1 + shift[i].dx))
    const minY = Math.min(...cuts.map((c, i) => c.box.y0 + shift[i].dy))
    const maxY = Math.max(...cuts.map((c, i) => c.box.y1 + shift[i].dy))
    const pad = Math.round(Math.max(maxX - minX, maxY - minY) * CANVAS_PAD)
    // No padding below: the figure is cropped flat at the cell bottom and sits on the corner of the video.
    const ox = minX - pad
    const oy = minY - pad
    const outW = maxX - minX + 1 + 2 * pad
    const outH = maxY - minY + 1 + pad

    const files = new Map<string, Buffer>()
    cuts.forEach((c, i) => {
      const out = Buffer.alloc(outW * outH * 4)
      const { dx, dy } = shift[i]
      for (let y = 0; y < outH; y++) {
        const sy = y + oy - dy
        if (sy < 0 || sy >= c.h) continue
        const sx0 = Math.max(0, ox - dx)
        const sx1 = Math.min(c.w, outW + ox - dx)
        if (sx1 <= sx0) continue
        c.px.copy(out, (y * outW + (sx0 + dx - ox)) * 4, (sy * c.w + sx0) * 4, (sy * c.w + sx1) * 4)
      }
      files.set(`${NARRATOR_GRID[i].expression}-${NARRATOR_GRID[i].mouth}.png`, toPng(outW, outH, out))
      if (i === 0) files.set('thumb.png', makeThumb(outW, outH, out))
    })

    mkdirSync(outDir, { recursive: true })
    for (const [name, bytes] of files) {
      // Write beside the target and rename, so a crash never leaves a half-written sprite.
      const tmp = join(outDir, `${name}.part`)
      writeFileSync(tmp, bytes)
      renameSync(tmp, join(outDir, name))
    }
    return { ok: true }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

/** Pixels on a sprite's edge that still lean toward the key color; used by the dev harness to prove no fringe is left. */
export function fringeCount(spritePng: Buffer, key: Narrator['keyColor']): { edge: number; keyed: number } {
  const img = nativeImage.createFromBuffer(spritePng)
  const { width: w, height: h } = img.getSize()
  const px = img.toBitmap()
  let edge = 0
  let keyed = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4
      const alpha = px[o + 3]
      if (alpha === 0) continue
      let near = alpha < 255
      for (let dy = -1; dy <= 1 && !near; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || px[(ny * w + nx) * 4 + 3] === 0) {
            near = true
            break
          }
        }
      }
      if (!near) continue
      edge++
      // Un-premultiply before judging the hue.
      const b = (px[o] * 255) / alpha
      const g = (px[o + 1] * 255) / alpha
      const r = (px[o + 2] * 255) / alpha
      const lean = key === '#00FF00' ? g - Math.max(r, b) : Math.min(r, b) - g
      if (lean > 24) keyed++
    }
  }
  return { edge, keyed }
}
