import type { CSSProperties, ReactNode } from 'react'
import { Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import type { CodeKind, ExplainerLook, SceneHighlight } from '@shared/explainer'
import { alpha, BODY_FONT, enter, MONO_FONT, SNAP } from './layout'

/** Words that rise into place one after another. */
export function Words({ text, delay = 0, stagger = 2.2, style, blur = false }: { text: string; delay?: number; stagger?: number; style?: CSSProperties; blur?: boolean }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const words = text.split(/\s+/).filter(Boolean)
  return (
    <div style={style}>
      {words.map((w, i) => {
        const p = enter(frame, fps, delay + i * stagger, SNAP)
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              opacity: p,
              transform: `translateY(${(1 - p) * 0.45}em)`,
              filter: blur ? `blur(${(1 - p) * 8}px)` : undefined,
              whiteSpace: 'pre'
            }}
          >
            {w}
            {i < words.length - 1 ? ' ' : ''}
          </span>
        )
      })}
    </div>
  )
}

/** Fades and lifts its children in after `delay` frames. */
export function Rise({ delay = 0, children, style, distance = 24 }: { delay?: number; children: ReactNode; style?: CSSProperties; distance?: number }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const p = enter(frame, fps, delay)
  return <div style={{ ...style, opacity: p, transform: `translateY(${(1 - p) * distance}px)` }}>{children}</div>
}

// ---------- code ----------

type Token = { text: string; kind: 'plain' | 'comment' | 'string' | 'flag' | 'keyword' | 'prompt' | 'number' }

const KEYWORDS = new Set(
  'const let var function return if else for while import from export def class async await new true false null None True False print echo cd sudo npm npx pip git python node'.split(
    ' '
  )
)

/** A light, dependable highlighter: comments, strings, flags, numbers and common keywords. */
function tokenize(line: string, kind: CodeKind): Token[] {
  const out: Token[] = []
  let rest = line
  if (kind === 'terminal') {
    const m = /^(\$|>|#)\s?/.exec(rest)
    if (m && m[1] !== '#') {
      out.push({ text: m[0], kind: 'prompt' })
      rest = rest.slice(m[0].length)
    }
  }
  // Comments start at a word boundary, so URLs (https://…) and colors (#fff) stay plain text.
  const re = /((?<!\S)\/\/.*$|(?<!\S)#.*$|"[^"]*"?|'[^']*'?|`[^`]*`?|--?[A-Za-z][\w-]*|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*\b|\s+|.)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(rest))) {
    const t = m[0]
    if ((t.startsWith('//') || t.startsWith('#')) && (m.index === 0 || /\s/.test(rest[m.index - 1]))) out.push({ text: t, kind: 'comment' })
    else if (/^["'`]/.test(t)) out.push({ text: t, kind: 'string' })
    else if (/^--?[A-Za-z]/.test(t) && kind === 'terminal') out.push({ text: t, kind: 'flag' })
    else if (/^\d/.test(t)) out.push({ text: t, kind: 'number' })
    else if (KEYWORDS.has(t)) out.push({ text: t, kind: 'keyword' })
    else out.push({ text: t, kind: 'plain' })
  }
  return out
}

/**
 * A code editor or terminal window that types its content. Typing takes at most 40% of the scene and two
 * seconds, so the viewer can still read the finished code while the narration explains it.
 */
export function CodeWindow({
  code,
  kind,
  language,
  look,
  u,
  width,
  maxHeight,
  delay,
  sceneFrames
}: {
  code: string
  kind: CodeKind
  language: string
  look: ExplainerLook
  u: number
  width: number
  maxHeight: number
  delay: number
  sceneFrames: number
}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const p = look.palette
  const lines = code.split('\n').slice(0, 12)
  const longest = Math.max(12, ...lines.map((l) => l.length))
  // Characters must fit the window; long lines get a smaller size instead of wrapping.
  const fontSize = Math.min(34 * u, (width - 80 * u) / (longest * 0.61), (maxHeight - 120 * u) / (lines.length * 1.55))
  const total = lines.reduce((n, l) => n + l.length + 1, 0)
  // About 25 characters a second, so a short command is typed in a blink and long code still ends in time.
  const typeFrames = Math.min(2 * fps, Math.max(10, sceneFrames * 0.4), Math.max(6, (total / 25) * fps))
  const shown = Math.floor(interpolate(frame, [delay + 8, delay + 8 + typeFrames], [0, total], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }))
  const appear = enter(frame, fps, delay)
  const colors: Record<Token['kind'], string> = {
    plain: p.dark ? '#E6EAF0' : '#1D2330',
    comment: p.dark ? '#6B778A' : '#8A8F98',
    string: p.accent2,
    flag: p.accent,
    keyword: p.accent,
    prompt: p.accent,
    number: p.accent2
  }
  let budget = shown
  const done = shown >= total
  const cursorOn = Math.floor(frame / (fps / 2)) % 2 === 0
  const bg = p.dark ? '#0A0D12' : '#FBFAF7'
  return (
    <div
      style={{
        width,
        borderRadius: 22 * u,
        background: bg,
        border: `${2 * u}px solid ${alpha(p.ink, p.dark ? 0.12 : 0.14)}`,
        boxShadow: `0 ${30 * u}px ${80 * u}px ${alpha('#000000', p.dark ? 0.45 : 0.16)}`,
        overflow: 'hidden',
        opacity: appear,
        transform: `translateY(${(1 - appear) * 40 * u}px) scale(${0.96 + 0.04 * appear})`
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 * u, height: 64 * u, padding: `0 ${26 * u}px`, background: alpha(p.ink, p.dark ? 0.06 : 0.05) }}>
        {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => (
          <span key={c} style={{ width: 16 * u, height: 16 * u, borderRadius: '50%', background: c }} />
        ))}
        <span style={{ marginLeft: 14 * u, fontFamily: MONO_FONT, fontSize: 22 * u, color: alpha(p.ink, 0.55), letterSpacing: '0.02em' }}>
          {kind === 'terminal' ? 'Terminal' : language || 'kode'}
        </span>
      </div>
      <div style={{ padding: `${26 * u}px ${34 * u}px ${30 * u}px`, fontFamily: MONO_FONT, fontSize, lineHeight: 1.55, whiteSpace: 'pre' }}>
        {lines.map((line, i) => {
          const visible = Math.max(0, Math.min(line.length, budget))
          const typing = !done && budget >= 0 && budget <= line.length
          budget -= line.length + 1
          let left = visible
          return (
            <div key={i} style={{ minHeight: '1.55em' }}>
              {tokenize(line, kind).map((t, k) => {
                if (left <= 0) return null
                const part = t.text.slice(0, left)
                left -= t.text.length
                return (
                  <span key={k} style={{ color: colors[t.kind], fontWeight: t.kind === 'keyword' || t.kind === 'prompt' ? 700 : 400 }}>
                    {part}
                  </span>
                )
              })}
              {(typing || (done && i === lines.length - 1)) && (
                <span style={{ display: 'inline-block', width: '0.55em', height: '1.1em', verticalAlign: '-0.18em', background: p.accent, opacity: cursorOn ? 1 : 0 }} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------- pictures ----------

/** Where an image of `iw`×`ih` sits inside a `w`×`h` box when it is contained (letterboxed). */
function containRect(iw: number, ih: number, w: number, h: number): { x: number; y: number; w: number; h: number } {
  const s = Math.min(w / iw, h / ih)
  return { x: (w - iw * s) / 2, y: (h - ih * s) / 2, w: iw * s, h: ih * s }
}

/**
 * A scene picture. Screenshots (`contain`) keep their whole frame inside a browser-like window and can carry
 * a highlight box; AI pictures fill a rounded card and drift slowly.
 */
export function Picture({
  image,
  look,
  u,
  width,
  height,
  delay,
  sceneFrames,
  screenshot,
  highlight,
  radius = 24
}: {
  image: { src: string; width: number; height: number }
  look: ExplainerLook
  u: number
  width: number
  height: number
  delay: number
  sceneFrames: number
  screenshot: boolean
  highlight: SceneHighlight | null
  radius?: number
}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const p = look.palette
  const appear = enter(frame, fps, delay)
  const drift = interpolate(frame, [0, sceneFrames], [1.0, 1.07])
  const shell: CSSProperties = {
    width,
    height,
    borderRadius: radius * u,
    overflow: 'hidden',
    position: 'relative',
    opacity: appear,
    transform: `translateY(${(1 - appear) * 40 * u}px) scale(${0.96 + 0.04 * appear})`,
    boxShadow: `0 ${30 * u}px ${80 * u}px ${alpha('#000000', p.dark ? 0.45 : 0.18)}`
  }
  if (!screenshot) {
    return (
      <div style={{ ...shell, background: p.surface }}>
        <Img src={image.src} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${drift})` }} />
      </div>
    )
  }
  const bar = 54 * u
  const area = { w: width, h: height - bar }
  const r = containRect(image.width, image.height, area.w, area.h)
  const hl = highlight
  const hp = enter(frame, fps, delay + 22, { damping: 14, stiffness: 120 })
  return (
    <div style={{ ...shell, background: p.dark ? '#0A0D12' : '#FFFFFF', border: `${2 * u}px solid ${alpha(p.ink, 0.12)}` }}>
      <div style={{ height: bar, display: 'flex', alignItems: 'center', gap: 10 * u, padding: `0 ${20 * u}px`, background: alpha(p.ink, 0.06) }}>
        {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => (
          <span key={c} style={{ width: 13 * u, height: 13 * u, borderRadius: '50%', background: c }} />
        ))}
        <span style={{ marginLeft: 16 * u, flex: 1, height: 26 * u, borderRadius: 13 * u, background: alpha(p.ink, 0.08) }} />
      </div>
      <div style={{ position: 'absolute', left: 0, top: bar, width: area.w, height: area.h, background: alpha(p.ink, 0.04) }}>
        <Img src={image.src} style={{ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h }} />
        {hl && (
          <div
            style={{
              position: 'absolute',
              left: r.x + hl.x * r.w,
              top: r.y + hl.y * r.h,
              width: hl.w * r.w,
              height: hl.h * r.h,
              borderRadius: 14 * u,
              border: `${6 * u}px solid ${p.accent}`,
              // Everything outside the box dims, so the eye goes to the highlighted part.
              boxShadow: `0 0 0 ${4000 * u}px ${alpha('#000000', 0.38 * Math.min(1, hp))}`,
              opacity: Math.min(1, hp),
              transform: `scale(${1.25 - 0.25 * hp})`
            }}
          />
        )}
      </div>
    </div>
  )
}

export function Pill({ children, look, u, filled = false, style }: { children: ReactNode; look: ExplainerLook; u: number; filled?: boolean; style?: CSSProperties }) {
  const p = look.palette
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 12 * u,
        padding: `${10 * u}px ${24 * u}px`,
        borderRadius: 999,
        fontFamily: BODY_FONT,
        fontWeight: 700,
        fontSize: 26 * u,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        background: filled ? p.accent : alpha(p.accent, 0.14),
        color: filled ? (p.dark ? p.bg : '#FFFFFF') : p.accent,
        ...style
      }}
    >
      {children}
    </span>
  )
}
