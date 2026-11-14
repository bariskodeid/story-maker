import { estimateWordTimings } from './captions'
import { anchorPoint } from './overlays'
import { stripVoiceTags } from './speech'
import { clipCaptionWords, voiceSpan } from './timeline'
import type { Clip, NarratorExpression, NarratorSettings, WordTiming } from './types'

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

// Closing quotes and brackets may trail the punctuation: Dia bilang "ya."
const TERMINATOR = /[.!?…]["'”’)\]]*$/
const STRONG_TERMINATOR = /[!?…]["'”’)\]]*$/
const TRAILING_CLOSERS = /["'”’)\]]*$/
const LEADING_OPENERS = /^[("“‘']+/
const LINE_BREAK = /\r?\n/
const WHITESPACE = /\s+/
const ELLIPSIS_DOTS = /\.\.[^.]*$/
const LONE_LETTER = /^\p{L}$/u

function endsSentence(token: string): boolean {
  if (!TERMINATOR.test(token)) return false
  if (STRONG_TERMINATOR.test(token) || ELLIPSIS_DOTS.test(token)) return true
  const bare = token.replace(TRAILING_CLOSERS, '').replace(/\.$/, '').replace(LEADING_OPENERS, '').toLowerCase()
  // A lone letter is an initial ("A. Rahman"), not the end of a thought.
  return !(ABBREVIATIONS.has(bare) || LONE_LETTER.test(bare))
}

/**
 * Splits narration into sentences on . ! ? … and line breaks. Voice tags are dropped first, because captions never
 * show them and the sentence word counts must match the caption words.
 */
export function splitSentences(text: string): string[] {
  const out: string[] = []
  for (const line of text.split(LINE_BREAK)) {
    let cur: string[] = []
    for (const token of stripVoiceTags(line).split(WHITESPACE).filter(Boolean)) {
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
    at += s.split(WHITESPACE).filter(Boolean).length
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

/** A track with the per-clip work done once: sentence spans are what made per-frame lookups slow. */
export interface PreparedNarratorTrack {
  clips: { clip: NarratorTrackClip; spans: { start: number; end: number }[] }[]
}

export function prepareNarratorTrack(track: NarratorTrackClip[]): PreparedNarratorTrack {
  return { clips: track.map((clip) => ({ clip, spans: sentenceSpans(clip.text, clip.words) })) }
}

// Callers pass the same track array every frame, so the prepared form is cached per array identity.
const prepared = new WeakMap<NarratorTrackClip[], PreparedNarratorTrack>()

function resolve(track: NarratorTrackClip[] | PreparedNarratorTrack): PreparedNarratorTrack {
  if (!Array.isArray(track)) return track
  let p = prepared.get(track)
  if (!p) {
    p = prepareNarratorTrack(track)
    prepared.set(track, p)
  }
  return p
}

/** Index of the last word that has started by `rel`, or 0 when none has. Words are sorted by start. */
function latestStartedWord(words: WordTiming[], rel: number): number {
  let lo = 0
  let hi = words.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (words[mid].start <= rel) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** State inside one clip at absolute time t, or null when t is outside its speech. */
function clipState(
  c: PreparedNarratorTrack['clips'][number],
  t: number
): { expression: NarratorExpression; open: boolean; speaking: boolean } | null {
  const words = c.clip.words
  if (words.length === 0) return null
  const rel = t - c.clip.startSec
  if (rel < words[0].start || rel >= words[words.length - 1].end) return null
  // The latest word that has started decides the sentence, so the expression holds through pauses between words.
  const idx = latestStartedWord(words, rel)
  const sentence = c.spans.findIndex((s) => idx >= s.start && idx < s.end)
  const w = words[idx]
  const speaking = rel < w.end
  const open = speaking && (w.end - w.start > FLAP_MIN_SEC ? Math.floor((rel - w.start) / FLAP_PERIOD_SEC) % 2 === 0 : true)
  return { expression: (sentence >= 0 ? c.clip.cues[sentence] : undefined) ?? 'neutral', open, speaking }
}

/** Which sprite shows at time t. Stateless: the same t always gives the same frame, in preview and in export. */
export function narratorSpriteAt(track: NarratorTrackClip[] | PreparedNarratorTrack, t: number): NarratorFrame {
  // Breathing runs even when silent so the narrator never looks frozen.
  const scale = 1 + BREATH * Math.sin((2 * Math.PI * t) / BREATH_PERIOD_SEC)
  let state: ReturnType<typeof clipState> = null
  for (const c of resolve(track).clips) {
    state = clipState(c, t)
    if (state) break
  }
  if (!state) return { expression: 'neutral', mouth: 'closed', scale, offsetY: 0 }
  return {
    expression: state.expression,
    mouth: state.open ? 'open' : 'closed',
    scale,
    // Bounce follows speech, not the mouth flap, so it stays smooth while the mouth alternates inside a long word.
    offsetY: state.speaking ? -BOUNCE * Math.abs(Math.sin((Math.PI * t) / BOUNCE_PERIOD_SEC)) : 0
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
  track: NarratorTrackClip[] | PreparedNarratorTrack,
  totalSec: number,
  fps: number
): { sprite: string; startSec: number; endSec: number }[] {
  if (!(totalSec > 0) || !(fps > 0)) return []
  const frames = Math.max(1, Math.ceil(totalSec * fps - 1e-9))
  const prep = resolve(track)
  const out: { sprite: string; startSec: number; endSec: number }[] = []
  for (let i = 0; i < frames; i++) {
    const f = narratorSpriteAt(prep, i / fps)
    const sprite = `${f.expression}-${f.mouth}`
    const prev = out[out.length - 1]
    if (prev && prev.sprite === sprite) prev.endSec = (i + 1) / fps
    else out.push({ sprite, startSec: i / fps, endSec: (i + 1) / fps })
  }
  out[out.length - 1].endSec = totalSec
  return out
}

/** A clip on the story timeline, as far as the narrator is concerned. `audioMs` is null when the clip has no voice. */
export interface StoryNarratorClip {
  startSec: number
  clip: Pick<Clip, 'durationMs' | 'voiceInMs' | 'voiceOutMs' | 'voiceStartMs' | 'narration' | 'narratorCues'>
  audioMs: number | null
  /** Word timings of the voice file; empty or missing means "estimate them from the text". */
  words: WordTiming[] | undefined
}

/**
 * The narrator track of a story timeline, built once here for the preview and the export. Words come from
 * `clipCaptionWords`, exactly the ones captions show, so mouth and caption highlight move together. Voices
 * without timings (Gemini TTS before a Whisper sync) get estimated ones so the narrator still talks.
 * Always returns a new array: narratorSpriteAt caches by array identity.
 */
export function storyNarratorTrack(clips: StoryNarratorClip[]): NarratorTrackClip[] {
  const out: NarratorTrackClip[] = []
  for (const c of clips) {
    if (c.audioMs == null) continue
    let words = clipCaptionWords(c.clip, c.words ?? [], c.audioMs).words
    if (words.length === 0 && !(c.words && c.words.length)) {
      const span = voiceSpan(c.clip, c.audioMs)
      const shift = span.startMs / 1000
      words = estimateWordTimings(stripVoiceTags(c.clip.narration), span.playMs / 1000).map((w) => ({ ...w, start: w.start + shift, end: w.end + shift }))
    }
    if (words.length) out.push({ startSec: c.startSec, words, text: c.clip.narration, cues: c.clip.narratorCues })
  }
  return out
}

/** The sprite to draw for `key`: itself, else the same expression with a closed mouth, else neutral, else any. */
export function pickSprite(key: string, available: Set<string>): string | null {
  if (available.has(key)) return key
  const closed = `${key.split('-')[0]}-closed`
  if (available.has(closed)) return closed
  if (available.has('neutral-closed')) return 'neutral-closed'
  return available.values().next().value ?? null
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * How far (pixels, <= 0) a bottom caption must move up so it clears the narrator box, or 0 when they do not
 * collide. Shared so the preview and the export move captions identically.
 */
export function captionShiftAbove(caption: Rect, avoid: Rect | null, frameH: number): number {
  if (!avoid) return 0
  const gap = frameH * 0.015
  const across = caption.x < avoid.x + avoid.w && caption.x + caption.w > avoid.x
  const down = caption.y + caption.h > avoid.y - gap && caption.y < avoid.y + avoid.h
  if (!across || !down) return 0
  return Math.max(-caption.y, avoid.y - gap - (caption.y + caption.h))
}
