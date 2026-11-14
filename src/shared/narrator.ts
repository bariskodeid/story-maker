import { anchorPoint } from './overlays'
import { stripVoiceTags } from './speech'
import type { NarratorExpression, NarratorSettings, WordTiming } from './types'

/**
 * Animated narrator (PNGTuber style): one sprite sheet with six expressions, each with a closed and an open mouth.
 * The story preview, the story export and the explainer Remotion layer all ask this module which sprite shows at
 * time t and where it sits, so they cannot drift apart. Everything here is a pure function of time.
 */

export type { NarratorExpression, NarratorSettings } from './types'
export type NarratorMouth = 'closed' | 'open'

export const NARRATOR_EXPRESSIONS: NarratorExpression[] = ['neutral', 'happy', 'sad', 'surprised', 'serious', 'thinking']

/** Sprite sheet cells, row-major: closed then open per expression, two expressions per row. */
export const NARRATOR_GRID: { expression: NarratorExpression; mouth: NarratorMouth }[] = NARRATOR_EXPRESSIONS.flatMap(
  (expression) => [
    { expression, mouth: 'closed' as const },
    { expression, mouth: 'open' as const }
  ]
)

export const DEFAULT_NARRATOR: NarratorSettings = { id: null, anchor: 'bottomRight', size: 'medium', enabled: false }

const ANCHORS: NarratorSettings['anchor'][] = ['bottomLeft', 'bottomRight']
const SIZES: NarratorSettings['size'][] = ['small', 'medium', 'large']

/** Reads stored JSON of unknown shape; anything invalid falls back to the default for that field. */
export function normalizeNarratorSettings(raw: unknown): NarratorSettings {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    id: typeof o.id === 'string' && o.id ? o.id : null,
    anchor: ANCHORS.includes(o.anchor as NarratorSettings['anchor']) ? (o.anchor as NarratorSettings['anchor']) : DEFAULT_NARRATOR.anchor,
    size: SIZES.includes(o.size as NarratorSettings['size']) ? (o.size as NarratorSettings['size']) : DEFAULT_NARRATOR.size,
    enabled: o.enabled === true
  }
}

/** Unknown entries become neutral so a model that invents an expression never breaks the sprite lookup. */
export function normalizeCues(raw: unknown): NarratorExpression[] {
  if (!Array.isArray(raw)) return []
  return raw.map((c) => (NARRATOR_EXPRESSIONS.includes(c as NarratorExpression) ? (c as NarratorExpression) : 'neutral'))
}

// A trailing period on these does not end a sentence (Indonesian and common English short forms).
const ABBREVIATIONS = new Set([
  'dr', 'drs', 'dra', 'ir', 'prof', 'mr', 'mrs', 'ms', 'sr', 'jr', 'st', 'no', 'vs', 'etc', 'dll', 'dsb', 'dst', 'yth',
  'hlm', 'jl', 'tn', 'ny', 'sdr', 'kec', 'kab', 'dkk', 'tsb', 'cth', 'e.g', 'i.e'
])

const CLOSERS = '"\'”’)\\]'

function endsSentence(token: string): boolean {
  const tail = new RegExp(`[.!?…][${CLOSERS}]*$`)
  if (!tail.test(token)) return false
  if (new RegExp(`[!?…][${CLOSERS}]*$`).test(token) || /\.\.[^.]*$/.test(token)) return true
  const bare = token.replace(new RegExp(`[${CLOSERS}]*$`), '').replace(/\.$/, '').replace(/^[("“‘']+/, '').toLowerCase()
  // A lone letter is an initial ("A. Rahman"), not the end of a thought.
  return !(ABBREVIATIONS.has(bare) || /^\p{L}$/u.test(bare))
}

/**
 * Splits narration into sentences on . ! ? … and line breaks. Voice tags are dropped first, because captions never
 * show them and the sentence word counts must match the caption words.
 */
export function splitSentences(text: string): string[] {
  const out: string[] = []
  for (const line of text.split(/\r?\n/)) {
    let cur: string[] = []
    for (const token of stripVoiceTags(line).split(/\s+/).filter(Boolean)) {
      cur.push(token)
      if (endsSentence(token)) {
        out.push(cur.join(' '))
        cur = []
      }
    }
    if (cur.length) out.push(cur.join(' '))
  }
  return out
}

/**
 * Word index range of each sentence, `end` exclusive. Sentences are matched to words by order, counting words with
 * the same tokenization captions use (whitespace tokens of the tag-free text), so span i lines up with caption words.
 * If the word list is shorter than the text (trimmed clip), later spans are clamped and may be empty.
 */
export function sentenceSpans(text: string, words: WordTiming[]): { start: number; end: number }[] {
  let at = 0
  return splitSentences(text).map((s) => {
    const start = Math.min(at, words.length)
    at += s.split(/\s+/).filter(Boolean).length
    return { start, end: Math.min(at, words.length) }
  })
}

/** `words` are relative to the clip start; `startSec` places the clip on the timeline. */
export interface NarratorTrackClip {
  startSec: number
  words: WordTiming[]
  text: string
  cues: NarratorExpression[]
}

/** `offsetY` is a fraction of the sprite height (negative moves up); `scale` multiplies the sprite size. */
export interface NarratorFrame {
  expression: NarratorExpression
  mouth: NarratorMouth
  scale: number
  offsetY: number
}

// Words longer than this flap the mouth; shorter ones just stay open for their whole length.
const FLAP_MIN_SEC = 0.18
const FLAP_PERIOD_SEC = 0.11
const BOUNCE = 0.02
const BOUNCE_PERIOD_SEC = 0.3
const BREATH = 0.01
const BREATH_PERIOD_SEC = 3.5

/** Expression and mouth inside one clip at absolute time t, or null when t is outside its speech. */
function clipState(c: NarratorTrackClip, t: number): { expression: NarratorExpression; open: boolean } | null {
  if (c.words.length === 0) return null
  const rel = t - c.startSec
  const last = c.words[c.words.length - 1]
  if (rel < c.words[0].start || rel >= last.end) return null
  // The latest word that has started decides the sentence, so the expression holds through pauses between words.
  let idx = 0
  for (let i = 0; i < c.words.length; i++) {
    if (c.words[i].start <= rel) idx = i
    else break
  }
  const sentence = sentenceSpans(c.text, c.words).findIndex((s) => idx >= s.start && idx < s.end)
  const w = c.words[idx]
  const speaking = rel < w.end
  const open = speaking && (w.end - w.start > FLAP_MIN_SEC ? Math.floor((rel - w.start) / FLAP_PERIOD_SEC) % 2 === 0 : true)
  return { expression: (sentence >= 0 ? c.cues[sentence] : undefined) ?? 'neutral', open }
}

/** Which sprite shows at time t. Stateless: the same t always gives the same frame, in preview and in export. */
export function narratorSpriteAt(track: NarratorTrackClip[], t: number): NarratorFrame {
  // Breathing runs even when silent so the narrator never looks frozen.
  const scale = 1 + BREATH * Math.sin((2 * Math.PI * t) / BREATH_PERIOD_SEC)
  let state: { expression: NarratorExpression; open: boolean } | null = null
  for (const c of track) {
    state = clipState(c, t)
    if (state) break
  }
  if (!state) return { expression: 'neutral', mouth: 'closed', scale, offsetY: 0 }
  return {
    expression: state.expression,
    mouth: state.open ? 'open' : 'closed',
    scale,
    // Only bounce while a word is being said; a still narrator during pauses reads as listening.
    offsetY: state.open ? -BOUNCE * Math.abs(Math.sin((Math.PI * t) / BOUNCE_PERIOD_SEC)) : 0
  }
}

const SIZE_FRACTION = {
  landscape: { small: 0.26, medium: 0.34, large: 0.42 },
  portrait: { small: 0.18, medium: 0.23, large: 0.28 }
}

/** Sprite rectangle in frame pixels, pinned to a bottom corner with the same margin overlays use. */
export function narratorBox(
  frameW: number,
  frameH: number,
  s: NarratorSettings,
  spriteAspect: number
): { x: number; y: number; w: number; h: number } {
  const table = frameW >= frameH ? SIZE_FRACTION.landscape : SIZE_FRACTION.portrait
  const h = frameH * table[s.size]
  const w = h * spriteAspect
  // Overlay anchors are numpad presets: 1 = bottom left, 3 = bottom right.
  const p = anchorPoint(s.anchor === 'bottomLeft' ? 1 : 3, frameW / frameH)
  return { x: s.anchor === 'bottomLeft' ? p.x * frameW : p.x * frameW - w, y: p.y * frameH - h, w, h }
}

/**
 * Sprite runs sampled on the frame grid and merged, for an FFmpeg concat list. Segments tile [0, totalSec] with no
 * gaps; the last one ends exactly at totalSec.
 */
export function narratorSegments(
  track: NarratorTrackClip[],
  totalSec: number,
  fps: number
): { sprite: string; startSec: number; endSec: number }[] {
  const frames = Math.max(1, Math.ceil(totalSec * fps - 1e-9))
  const out: { sprite: string; startSec: number; endSec: number }[] = []
  for (let i = 0; i < frames; i++) {
    const f = narratorSpriteAt(track, i / fps)
    const sprite = `${f.expression}-${f.mouth}`
    const prev = out[out.length - 1]
    if (prev && prev.sprite === sprite) prev.endSec = (i + 1) / fps
    else out.push({ sprite, startSec: i / fps, endSec: (i + 1) / fps })
  }
  out[out.length - 1].endSec = totalSec
  return out
}
