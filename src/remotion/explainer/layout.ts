import { spring, type SpringConfig } from 'remotion'
import type { ExplainerInput, ExplainerLook } from '@shared/explainer'

/**
 * Frame geometry shared by every scene. Sizes are written for a 1080-pixel short side and multiplied by `u`,
 * so 16:9 and 9:16 (and the square template previews) use the same numbers.
 */
export interface Frame {
  width: number
  height: number
  u: number
  portrait: boolean
  /** Content area: inside the margins and above the captions. */
  left: number
  top: number
  right: number
  bottom: number
  contentWidth: number
  contentHeight: number
}

export function frameOf(input: Pick<ExplainerInput, 'width' | 'height' | 'captions'>): Frame {
  const { width, height } = input
  const u = Math.min(width, height) / 1080
  const portrait = height > width * 1.05
  // Shorts and Reels draw their own buttons over the bottom and the right edge of a vertical video.
  const left = (portrait ? 72 : 120) * u
  const right = (portrait ? 96 : 120) * u
  const top = (portrait ? 190 : 104) * u
  const bottom = (portrait ? (input.captions ? 470 : 330) : input.captions ? 250 : 116) * u
  return {
    width,
    height,
    u,
    portrait,
    left,
    top,
    right: width - right,
    bottom: height - bottom,
    contentWidth: width - left - right,
    contentHeight: height - top - bottom
  }
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

/** Readable text color on top of a fill. */
export function onColor(hex: string): string {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? '#111111' : '#FFFFFF'
}
