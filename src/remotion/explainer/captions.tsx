import { Fragment, type CSSProperties, type ReactNode } from 'react'
import { useCurrentFrame, useVideoConfig } from 'remotion'
import { captionAt, chunkWords } from '@shared/captions'
import { getCaptionStyle, getTemplate, type CaptionStyleId, type ExplainerInput, type ExplainerLook, type ExplainerTemplateId } from '@shared/explainer'
import { alpha, BODY_FONT, type Frame } from './layout'

/**
 * Burned-in captions of the narration in four looks. CaptionLine is pure (no Remotion hooks), so the editor's
 * style picker draws exactly what the video draws.
 */

function luminance(hex: string): number {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * The spoken word's color: the template's choice, unless it would vanish. Every style draws on something dark
 * (a box or an outline), so the color must be light enough; the outlined styles sit on the background itself,
 * so they also skip the background color.
 */
export function captionLitColor(templateId: ExplainerTemplateId, look: ExplainerLook, style: CaptionStyleId = 'box'): string {
  const pick = getTemplate(templateId).captionLit
  const p = look.palette
  const c = pick === 'accent' ? p.accent : pick === 'accent2' ? p.accent2 : pick === 'bg' ? p.bg : pick
  const ok = (x: string): boolean => luminance(x) >= 0.32 && (style === 'box' || x.toLowerCase() !== p.bg.toLowerCase())
  if (ok(c)) return c
  return [p.accent, p.accent2, '#FFD84D'].find(ok) ?? '#FFD84D'
}

/** A hard outline around light text, from eight offset shadows (works on any background). */
function outline(size: number, width: number, color = '#0A0A0F'): string {
  const o = Math.max(1.5, size * width)
  const d = o * 0.7
  return [
    [o, 0],
    [-o, 0],
    [0, o],
    [0, -o],
    [d, d],
    [-d, d],
    [d, -d],
    [-d, -d]
  ]
    .map(([x, y]) => `${x}px ${y}px 0 ${color}`)
    .concat(`0 ${size * 0.08}px ${size * 0.14}px rgba(0,0,0,0.45)`)
    .join(', ')
}

export interface CaptionLineProps {
  words: string[]
  /** The word being spoken; earlier words are done. */
  active: number
  /** 0–1 through the active word (karaoke fill, pop of the big style). */
  progress: number
  /** 0–1 since the line appeared. */
  appear: number
  style: CaptionStyleId
  look: ExplainerLook
  templateId: ExplainerTemplateId
  /** Font size and box metrics in px (see CAPTION_METRICS). */
  size: number
  lineHeight: number
  padX: number
  padY: number
  maxWidth: number
}

export function CaptionLine({ words, active, progress, appear, style, look, templateId, size, lineHeight, padX, padY, maxWidth }: CaptionLineProps) {
  const p = look.palette
  const lit = captionLitColor(templateId, look, style)
  const base: CSSProperties = {
    display: 'inline-block',
    maxWidth,
    padding: `${padY}px ${padX}px`,
    fontSize: size,
    lineHeight,
    textAlign: 'center',
    opacity: Math.min(1, 0.35 + appear * 2)
  }
  // Each word keeps its letters together, and the spaces between words stay real break points, so a long
  // line wraps inside the band instead of running off the frame.
  const each = (render: (w: string, i: number) => ReactNode): ReactNode =>
    words.map((w, i) => (
      <Fragment key={i}>
        {render(w, i)}
        {i < words.length - 1 ? ' ' : null}
      </Fragment>
    ))

  if (style === 'box') {
    // Tips draws its box in the ink color; on a dark palette the ink is light, so the box stays near-black.
    const bg = templateId === 'tips' && !p.dark ? p.ink : 'rgba(6, 8, 12, 0.84)'
    return (
      <div
        style={{
          ...base,
          borderRadius: size * 0.42,
          background: bg,
          fontFamily: BODY_FONT,
          fontWeight: 800,
          color: '#FFFFFF',
          transform: `scale(${0.94 + 0.06 * appear})`
        }}
      >
        {each((w, i) => (
          <span style={{ color: i === active ? lit : undefined, whiteSpace: 'nowrap' }}>{w}</span>
        ))}
      </div>
    )
  }

  if (style === 'karaoke') {
    const upper = look.heading.upper
    return (
      <div
        style={{
          ...base,
          fontFamily: BODY_FONT,
          fontWeight: 800,
          color: '#FFFFFF',
          textTransform: upper ? 'uppercase' : 'none',
          letterSpacing: upper ? '0.01em' : '-0.005em',
          textShadow: outline(size, 0.055)
        }}
      >
        {each((w, i) => {
          if (i !== active) return <span style={{ color: i < active ? lit : undefined, whiteSpace: 'nowrap' }}>{w}</span>
          // The color fills the spoken word from left to right: a lit copy on top, clipped to the progress.
          return (
            <span style={{ position: 'relative', display: 'inline-block', whiteSpace: 'nowrap' }}>
              {w}
              <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, color: lit, textShadow: 'none', clipPath: `inset(-20% ${(1 - progress) * 100}% -20% 0)` }}>
                {w}
              </span>
            </span>
          )
        })}
      </div>
    )
  }

  if (style === 'minimal') {
    const ink = p.dark ? '#FFFFFF' : p.ink
    const halo = p.dark
      ? `0 ${size * 0.05}px ${size * 0.3}px rgba(0,0,0,0.85), 0 0 ${size * 0.1}px rgba(0,0,0,0.7)`
      : `0 0 ${size * 0.3}px ${alpha(p.bg, 0.95)}, 0 0 ${size * 0.1}px ${alpha(p.bg, 0.95)}`
    return (
      <div style={{ ...base, fontFamily: BODY_FONT, fontWeight: 600, color: ink, textShadow: halo, letterSpacing: '0.005em' }}>
        {each((w, i) => (
          <span style={{ opacity: i <= active ? 1 : 0.5, whiteSpace: 'nowrap' }}>{w}</span>
        ))}
      </div>
    )
  }

  // The big short-form style: the template's heading font in capitals with a heavy outline.
  const pop = 1 + 0.14 * Math.max(0, 1 - progress * 3)
  return (
    <div
      style={{
        ...base,
        fontFamily: `'${look.heading.family}', Poppins, sans-serif`,
        fontWeight: look.heading.weight,
        textTransform: 'uppercase',
        letterSpacing: look.heading.upper ? '0.015em' : '0',
        color: '#FFFFFF',
        textShadow: outline(size, 0.07),
        transform: `scale(${0.82 + 0.18 * Math.min(1, appear * 1.15)})`
      }}
    >
      {each((w, i) => (
        <span
          style={{
            display: 'inline-block',
            whiteSpace: 'nowrap',
            // Room on both sides, so the spoken word can pop without swallowing the spaces next to it.
            margin: '0 0.07em',
            color: i === active ? lit : undefined,
            transform: i === active ? `scale(${pop}) rotate(-1.5deg)` : undefined
          }}
        >
          {w}
        </span>
      ))}
    </div>
  )
}

/** The captions of the current scene, in its band (frameOf keeps every scene's content out of that band). */
export function Captions({ input, f }: { input: ExplainerInput; f: Frame }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const band = f.caption
  if (!input.captions || !band) return null
  const item = input.scenes.find((s) => frame >= s.from && frame < s.from + s.frames)
  if (!item || !item.words.length) return null
  const spec = getCaptionStyle(input.caption.style)
  const t = (frame - item.from) / fps
  const hit = captionAt(chunkWords(item.words, spec.maxWords, spec.maxChars), t)
  if (!hit) return null
  const w = hit.chunk.words[hit.word]
  const progress = Math.min(1, Math.max(0, (t - w.start) / Math.max(0.05, w.end - w.start)))
  const appear = Math.min(1, Math.max(0, ((t - hit.chunk.start) * fps) / 6))
  return (
    <div
      style={{
        position: 'absolute',
        left: band.x,
        top: band.y,
        width: band.w,
        height: band.h,
        display: 'flex',
        justifyContent: 'center',
        alignItems: band.align === 'start' ? 'flex-start' : band.align === 'end' ? 'flex-end' : 'center'
      }}
    >
      <CaptionLine
        words={hit.chunk.words.map((x) => x.text)}
        active={hit.word}
        progress={progress}
        appear={appear}
        style={input.caption.style}
        look={input.look}
        templateId={input.templateId}
        size={band.size}
        lineHeight={band.lineHeight}
        padX={band.padX}
        padY={band.padY}
        maxWidth={band.w}
      />
    </div>
  )
}
