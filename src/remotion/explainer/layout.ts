import { spring, type SpringConfig } from 'remotion'
import type { CaptionStyleId, ExplainerInput, ExplainerLook } from '@shared/explainer'

/**
 * Frame geometry shared by every scene. Sizes are written for a 1080-pixel short side and multiplied by `u`,
 * so 16:9 and 9:16 (and the square template previews) use the same numbers.
 */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Where the captions go: the widest box a caption may take, and how a line sits inside it. */
export interface CaptionBand extends Rect {
  /** Font size in px (the big style already includes the heading font's own scale). */
  size: number
  lineHeight: number
  padX: number
  padY: number
  align: 'start' | 'center' | 'end'
}

export interface Frame {
  width: number
  height: number
  u: number
  portrait: boolean
  /** Content area: inside the margins and clear of the captions. */
  left: number
  top: number
  right: number
  bottom: number
  contentWidth: number
  contentHeight: number
  /** The caption band, or null when captions are off. Scenes never draw text inside it. */
  caption: CaptionBand | null
}

/**
 * Caption sizes per style for a 1080-pixel short side: font size [16:9, 9:16], line height and padding. The band
 * always has room for two lines, so a line that wraps still stays inside it.
 */
export const CAPTION_METRICS: Record<CaptionStyleId, { size: [number, number]; line: number; padX: number; padY: number }> = {
  box: { size: [46, 52], line: 1.3, padX: 30, padY: 14 },
  karaoke: { size: [52, 60], line: 1.22, padX: 8, padY: 8 },
  minimal: { size: [34, 40], line: 1.36, padX: 8, padY: 6 },
  bold: { size: [94, 110], line: 1.04, padX: 8, padY: 10 }
}

export function frameOf(input: Pick<ExplainerInput, 'width' | 'height' | 'captions' | 'caption' | 'look'>): Frame {
  const { width, height } = input
  const u = Math.min(width, height) / 1080
  const portrait = height > width * 1.05
  // Shorts and Reels draw their own buttons over the bottom and the right edge of a vertical video.
  const left = (portrait ? 72 : 120) * u
  const right = (portrait ? 96 : 120) * u
  let top = (portrait ? 190 : 104) * u
  let bottom = height - (portrait ? 330 : 116) * u
  let caption: CaptionBand | null = null
  if (input.captions) {
    const style = input.caption?.style ?? 'box'
    const m = CAPTION_METRICS[style]
    const size = m.size[portrait ? 1 : 0] * u * (style === 'bold' ? input.look.heading.scale : 1)
    const h = 2 * size * m.line + 2 * m.padY * u
    const w = width * (portrait ? 0.86 : 0.76)
    const gap = (portrait ? 44 : 30) * u
    const position = input.caption?.position ?? 'bottom'
    let y: number
    if (position === 'top') {
      y = top
      top = y + h + gap
    } else if (position === 'middle') {
      // A little below the middle, where short-form captions usually sit; the scene keeps the space above.
      y = height * (portrait ? 0.6 : 0.68) - h / 2
      bottom = y - gap
    } else {
      y = height - (portrait ? 330 : 78) * u - h
      bottom = y - gap
    }
    caption = {
      x: (width - w) / 2,
      y,
      w,
      h,
      size,
      lineHeight: m.line,
      padX: m.padX * u,
      padY: m.padY * u,
      align: position === 'top' ? 'start' : position === 'middle' ? 'center' : 'end'
    }
  }
  return {
    width,
    height,
    u,
    portrait,
    left,
    top,
    right: width - right,
    bottom,
    contentWidth: width - left - right,
    contentHeight: bottom - top,
    caption
  }
}

/** Places text can be: the content box and the caption band. Decorations keep out of them. */
export function textZones(f: Frame): Rect[] {
  const zones: Rect[] = [{ x: f.left, y: f.top, w: f.contentWidth, h: f.contentHeight }]
  if (f.caption) zones.push(f.caption)
  return zones
}

/** Distance from a point to a rectangle (0 inside). */
export function distToRect(px: number, py: number, r: Rect): number {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.w))
  const dy = Math.max(r.y - py, 0, py - (r.y + r.h))
  return Math.hypot(dx, dy)
}

export function overlaps(a: Rect, b: Rect, pad = 0): boolean {
  return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y
}

/**
 * A CSS mask that hides a layer inside the given zones, with soft edges. Background textures use it so they
 * never show between the letters of a heading or a caption.
 */
export function holeMask(width: number, height: number, zones: Rect[], feather: number): React.CSSProperties {
  const r = (z: Rect): string => `<rect x='${Math.round(z.x)}' y='${Math.round(z.y)}' width='${Math.round(z.w)}' height='${Math.round(z.h)}' fill='black'/>`
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${Math.round(width)}' height='${Math.round(height)}'>` +
    `<filter id='b'><feGaussianBlur stdDeviation='${Math.round(feather)}'/></filter>` +
    `<mask id='m'><rect width='100%' height='100%' fill='white'/><g filter='url(#b)'>${zones.map(r).join('')}</g></mask>` +
    `<rect width='100%' height='100%' fill='black' mask='url(#m)'/></svg>`
  const url = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`
  return { WebkitMaskImage: url, maskImage: url, WebkitMaskSize: '100% 100%', maskSize: '100% 100%', WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat' }
}

/** Font size for text that may be long: full size up to `fit` characters, then smaller, never below `min` of it. */
export function fitSize(text: string, size: number, fit: number, min = 0.55): number {
  const n = Math.max(1, text.length)
  return n <= fit ? size : size * Math.max(min, Math.sqrt(fit / n))
}

export const SNAP: SpringConfig = { damping: 200, mass: 0.6, stiffness: 180, overshootClamping: false }
export const BOUNCY: SpringConfig = { damping: 12, mass: 0.7, stiffness: 160, overshootClamping: false }

/** 0 → 1 from `delay` frames on. */
export function enter(frame: number, fps: number, delay = 0, config: Partial<SpringConfig> = SNAP): number {
  return spring({ frame: frame - delay, fps, config })
}

export function headingStyle(look: ExplainerLook, size: number): React.CSSProperties {
  return {
    fontFamily: `'${look.heading.family}', Poppins, sans-serif`,
    fontWeight: look.heading.weight,
    fontSize: size * look.heading.scale,
    lineHeight: look.heading.upper ? 0.98 : 1.08,
    letterSpacing: look.heading.upper ? '0.01em' : '-0.02em',
    textTransform: look.heading.upper ? 'uppercase' : 'none'
  }
}

export function numberStyle(look: ExplainerLook, size: number): React.CSSProperties {
  return {
    fontFamily: `'${look.number.family}', Poppins, sans-serif`,
    fontWeight: look.number.weight,
    fontSize: size * look.number.scale,
    lineHeight: 0.9,
    letterSpacing: look.number.id === 'mono' ? '-0.04em' : '0'
  }
}

export const BODY_FONT = "Poppins, 'Segoe UI', sans-serif"
export const MONO_FONT = "'JetBrains Mono', Consolas, monospace"
export const EMOJI_FONT = "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif"

/** #RRGGBB + alpha → rgba(). */
export function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

/** Mix of two #RRGGBB colors (t = 0 → a, 1 → b), as #RRGGBB. */
export function mix(a: string, b: string, t: number): string {
  const pa = [0, 2, 4].map((i) => parseInt(a.replace('#', '').slice(i, i + 2), 16))
  const pb = [0, 2, 4].map((i) => parseInt(b.replace('#', '').slice(i, i + 2), 16))
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')
}

/** Readable text color on top of a fill. */
export function onColor(hex: string): string {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? '#111111' : '#FFFFFF'
}
