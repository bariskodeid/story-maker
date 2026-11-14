import type { CSSProperties } from 'react'
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { alpha, BODY_FONT, enter, fitSize, headingStyle, MONO_FONT, numberStyle } from './layout'
import { Kicker } from './news'
import { FitBox, Rise, Words } from './parts'
import type { SceneProps } from './scenes'

/**
 * "Linimasa": a line that draws first, then the dated points arrive one by one along it, left to right in
 * 16:9 and top to bottom in 9:16. The newest point is accent-colored, earlier ones stay in place.
 */

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/** Two lines at most, ending in an ellipsis, so a long title never pushes the other points around. */
const clampLines = (n: number): CSSProperties => ({
  display: '-webkit-box',
  WebkitLineClamp: n,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  overflowWrap: 'anywhere'
})

export function TimelineScene({ item, input, f }: SceneProps) {
  const s = item.scene
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const { u, portrait } = f
  const look = input.look
  const p = look.palette
  const points = s.timeline
  const n = points.length
  // Points arrive across the first half of the scene, roughly as the narration reaches them (as in PointsScene).
  const gap = Math.max(6, Math.min(40, (item.frames * 0.5) / Math.max(1, n)))
  const start = 10
  const at = (i: number) => start + i * gap
  const drawn = interpolate(frame, [0, 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  // The newest point that has appeared; -1 before the first one.
  let latest = -1
  for (let i = 0; i < n; i++) if (frame >= at(i)) latest = i

  const dot = 34 * u
  const lineW = 5 * u
  const lineColor = alpha(p.ink, p.dark ? 0.45 : 0.4)

  const head = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 * u, width: f.contentWidth }}>
      <Kicker text={s.label} look={look} u={u} />
      <Words text={s.heading} delay={2} style={{ ...headingStyle(look, fitSize(s.heading, portrait ? 84 : 80, 26) * u), color: p.ink }} />
      {s.body && (
        <Rise delay={8}>
          <div style={{ fontFamily: BODY_FONT, fontWeight: 500, fontSize: (portrait ? 34 : 30) * u, lineHeight: 1.4, color: p.muted }}>{s.body}</div>
        </Rise>
      )}
    </div>
  )

  const marker = (i: number) => {
    const a = enter(frame, fps, at(i))
    const isLatest = i === latest
    return (
      <span
        style={{
          // A span ignores width and height unless it is a block, which squashed the dots into ovals.
          display: 'block',
          flexShrink: 0,
          width: dot,
          height: dot,
          borderRadius: '50%',
          boxSizing: 'border-box',
          background: isLatest ? p.accent : p.bg,
          border: `${lineW}px solid ${isLatest ? p.accent : p.ink}`,
          boxShadow: isLatest ? `0 0 0 ${8 * u}px ${alpha(p.accent, 0.28)}` : undefined,
          transform: `scale(${a * (isLatest ? 1.2 : 1)})`
        }}
      />
    )
  }

  const dateText = (i: number, size: number, center: boolean) => (
    <div style={{ ...numberStyle(look, fitSize(points[i].date, size, center ? 6 : 12) * u), color: p.ink, textAlign: center ? 'center' : 'left', whiteSpace: 'nowrap' }}>{points[i].date}</div>
  )

  const track = portrait ? (
    <div style={{ display: 'flex', flexDirection: 'column', width: f.contentWidth }}>
      {points.map((pt, i) => {
        const a = enter(frame, fps, at(i))
        // Each segment runs from this dot to the next, filling in order as the line draws.
        const seg = clamp01(drawn * Math.max(1, n - 1) - i)
        return (
          <div key={i} style={{ position: 'relative', display: 'flex', gap: 30 * u, paddingBottom: i < n - 1 ? 30 * u : 0, opacity: a, transform: `translateY(${(1 - a) * 30 * u}px)` }}>
            {i < n - 1 && (
              <div style={{ position: 'absolute', left: dot / 2 - lineW / 2, top: dot / 2, bottom: -dot / 2, width: lineW, background: lineColor, transformOrigin: 'top', transform: `scaleY(${seg})` }} />
            )}
            <div style={{ position: 'relative', paddingTop: 6 * u }}>{marker(i)}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 * u, minWidth: 0, flex: 1 }}>
              {dateText(i, 56, false)}
              <div style={{ ...clampLines(2), fontFamily: BODY_FONT, fontWeight: 600, fontSize: 36 * u, lineHeight: 1.25, color: p.ink }}>{pt.title}</div>
            </div>
          </div>
        )
      })}
    </div>
  ) : (
    <div style={{ display: 'flex', width: f.contentWidth }}>
      {points.map((pt, i) => {
        const a = enter(frame, fps, at(i))
        const seg = clamp01(drawn * Math.max(1, n - 1) - i)
        return (
          <div key={i} style={{ position: 'relative', flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 * u }}>
            {i < n - 1 && (
              <div style={{ position: 'absolute', left: '50%', top: dot / 2 - lineW / 2, width: '100%', height: lineW, background: lineColor, transformOrigin: 'left', transform: `scaleX(${seg})` }} />
            )}
            <div style={{ position: 'relative' }}>{marker(i)}</div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 * u, width: '100%', padding: `0 ${12 * u}px`, opacity: a, transform: `translateY(${(1 - a) * 24 * u}px)` }}>
              {dateText(i, 56, true)}
              <div style={{ ...clampLines(2), width: '100%', textAlign: 'center', fontFamily: BODY_FONT, fontWeight: 600, fontSize: 28 * u, lineHeight: 1.3, color: p.ink }}>{pt.title}</div>
            </div>
          </div>
        )
      })}
    </div>
  )

  return (
    <FitBox x={f.left} y={f.top} w={f.contentWidth} h={f.contentHeight} style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
      {/* The story sits in the middle of the box and the source stays at its foot. */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', gap: (portrait ? 44 : 56) * u, width: f.contentWidth }}>
        {head}
        {n > 0 && track}
      </div>
      {s.author && (
        <Rise delay={at(Math.max(0, n - 1)) + 6}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 * u, fontFamily: MONO_FONT, fontSize: 22 * u, letterSpacing: '0.06em', textTransform: 'uppercase', color: p.muted }}>
            <span style={{ width: 12 * u, height: 12 * u, background: p.accent }} />
            {s.author}
          </div>
        </Rise>
      )}
    </FitBox>
  )
}
