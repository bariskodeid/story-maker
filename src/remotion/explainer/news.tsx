import type { CSSProperties, ReactNode } from 'react'
import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import type { ExplainerInput, ExplainerLook } from '@shared/explainer'
import { alpha, BODY_FONT, enter, fitSize, headingStyle, holeMask, MONO_FONT, numberStyle, onColor, textZones, type Frame } from './layout'
import { FitBox, Rise, Words } from './parts'
import type { SceneProps } from './scenes'

/**
 * "Berita / rangkuman cepat": a news desk. Red kicker tabs, headline bars that wipe in like lower thirds,
 * a rundown of the stories, a channel bug with the desk and date, a ticker under the picture (16:9) and a
 * red ticker-band wipe between stories.
 */

/** Light bars on dark palettes, dark bars on light ones: the lower third always stands off the background. */
const barColors = (look: ExplainerLook): { bar: string; barInk: string } => {
  const bar = look.palette.dark ? '#F4F6FA' : '#121418'
  return { bar, barInk: onColor(bar) }
}

/** The desk name and date of the roundup, from the title scene. */
export function newsDesk(input: ExplainerInput): { desk: string; date: string } {
  const t = input.scenes.find((s) => s.scene.type === 'title')?.scene
  return { desk: t?.label ?? '', date: t?.value ?? '' }
}

const stories = (input: ExplainerInput) => input.scenes.filter((s) => s.scene.type === 'headline')

/** Red tab with the category, square-cornered like a broadcast graphic. */
export function Kicker({ text, look, u, delay = 0, extra }: { text: string; look: ExplainerLook; u: number; delay?: number; extra?: ReactNode }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const p = look.palette
  if (!text && !extra) return null
  const a = enter(frame, fps, delay)
  const tab: CSSProperties = { padding: `${9 * u}px ${18 * u}px`, fontFamily: BODY_FONT, fontWeight: 800, fontSize: 26 * u, letterSpacing: '0.1em', textTransform: 'uppercase', lineHeight: 1.1 }
  return (
    <div style={{ display: 'inline-flex', alignItems: 'stretch', opacity: a, clipPath: `inset(0 ${(1 - a) * 100}% 0 0)` }}>
      {text && <span style={{ ...tab, background: p.accent, color: '#FFFFFF' }}>{text}</span>}
      {extra && <span style={{ ...tab, background: p.dark ? '#05080F' : p.ink, color: p.dark ? p.ink : p.bg, fontFamily: MONO_FONT, fontWeight: 700, letterSpacing: '0.04em' }}>{extra}</span>}
    </div>
  )
}

/** A line with the source and the date, small and mono, as in a broadcast caption. */
function SourceLine({ author, date, look, u, color }: { author: string; date: string; look: ExplainerLook; u: number; color?: string }) {
  const p = look.palette
  if (!author && !date) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 * u, fontFamily: MONO_FONT, fontSize: 24 * u, letterSpacing: '0.06em', textTransform: 'uppercase', color: color ?? p.muted }}>
      <span style={{ width: 12 * u, height: 12 * u, background: p.accent }} />
      {[author, date].filter(Boolean).join('  ·  ')}
    </div>
  )
}

/** Headline in a bar that wipes in from the left, then the summary strip under it. */
function LowerThird({
  kicker,
  counter,
  heading,
  body,
  author,
  date,
  look,
  u,
  width,
  size
}: {
  kicker: string
  counter: string
  heading: string
  body: string
  author: string
  date: string
  look: ExplainerLook
  u: number
  width: number
  size: number
}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const p = look.palette
  const { bar, barInk } = barColors(look)
  const wipe = enter(frame, fps, 6, { damping: 200, stiffness: 120 })
  const strip = enter(frame, fps, 14, { damping: 200, stiffness: 120 })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width, gap: 0 }}>
      <Kicker text={kicker} look={look} u={u} delay={0} extra={counter || undefined} />
      <div
        style={{
          background: bar,
          padding: `${20 * u}px ${30 * u}px ${22 * u}px`,
          borderLeft: `${12 * u}px solid ${p.accent}`,
          maxWidth: width,
          clipPath: `inset(0 ${(1 - wipe) * 100}% 0 0)`,
          boxShadow: `0 ${18 * u}px ${44 * u}px ${alpha('#000000', 0.3)}`
        }}
      >
        <Words text={heading} delay={10} stagger={1.6} style={{ ...headingStyle(look, size), color: barInk }} />
      </div>
      {body && (
        <div
          style={{
            background: p.surface,
            padding: `${16 * u}px ${30 * u}px`,
            borderLeft: `${12 * u}px solid ${p.accent2}`,
            maxWidth: width * 0.94,
            clipPath: `inset(0 ${(1 - strip) * 100}% 0 0)`
          }}
        >
          <div style={{ fontFamily: BODY_FONT, fontWeight: 500, fontSize: 32 * u, lineHeight: 1.4, color: p.ink }}>{body}</div>
        </div>
      )}
      {(author || date) && (
        <Rise delay={22} style={{ marginTop: 18 * u }}>
          <SourceLine author={author} date={date} look={look} u={u} />
        </Rise>
      )}
    </div>
  )
}

// ---------- opener ----------

function Rundown({ input, u, width, delay }: { input: ExplainerInput; u: number; width: number; delay: number }) {
  const p = input.look.palette
  const list = stories(input).slice(0, 5)
  if (!list.length) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width, background: p.surface, borderTop: `${8 * u}px solid ${p.accent}`, boxShadow: `0 ${24 * u}px ${60 * u}px ${alpha('#000000', p.dark ? 0.4 : 0.12)}` }}>
      {list.map((s, i) => (
        <Rise key={s.id} delay={delay + i * 4} distance={18 * u}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 * u, padding: `${18 * u}px ${24 * u}px`, borderTop: i ? `${2 * u}px solid ${alpha(p.ink, 0.08)}` : undefined }}>
            <span style={{ ...numberStyle(input.look, 58 * u), color: p.accent, width: 64 * u, flexShrink: 0 }}>{String(i + 1).padStart(2, '0')}</span>
            <span style={{ fontFamily: BODY_FONT, fontWeight: 700, fontSize: 32 * u, lineHeight: 1.25, color: p.ink, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {s.scene.heading}
            </span>
          </div>
        </Rise>
      ))}
    </div>
  )
}

export function NewsTitleScene({ item, input, f }: SceneProps) {
  const s = item.scene
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const { u, portrait } = f
  const look = input.look
  const p = look.palette
  const rule = enter(frame, fps, 14)
  const side = !!item.image || stories(input).length > 0
  const textW = portrait || !side ? f.contentWidth : f.contentWidth * 0.56
  const text = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26 * u, width: textW }}>
      <Kicker text={s.label} look={look} u={u} extra={s.value || undefined} />
      <Words text={s.heading} delay={4} style={{ ...headingStyle(look, fitSize(s.heading, portrait ? 104 : 108, 30) * u), color: p.ink }} />
      <div style={{ width: 220 * u * rule, height: 12 * u, background: p.accent }} />
      {s.body && (
        <Rise delay={16}>
          <div style={{ fontFamily: BODY_FONT, fontWeight: 500, fontSize: (portrait ? 38 : 36) * u, lineHeight: 1.4, color: p.muted }}>{s.body}</div>
        </Rise>
      )}
      {s.author && (
        <Rise delay={22}>
          <SourceLine author={s.author} date="" look={look} u={u} />
        </Rise>
      )}
    </div>
  )
  const sideW = portrait ? f.contentWidth : f.contentWidth * 0.38
  const sidePart = item.image ? (
    <Rise delay={10} distance={40 * u}>
      <div style={{ position: 'relative', width: sideW, height: portrait ? sideW * 0.62 : sideW * 0.78, overflow: 'hidden', borderTop: `${8 * u}px solid ${p.accent}`, boxShadow: `0 ${24 * u}px ${60 * u}px ${alpha('#000000', 0.35)}` }}>
        <Img src={item.image.src} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${interpolate(frame, [0, item.frames], [1.04, 1.12])})` }} />
      </div>
    </Rise>
  ) : (
    <Rundown input={input} u={u} width={sideW} delay={12} />
  )
  return (
    <FitBox
      x={f.left}
      y={f.top}
      w={f.contentWidth}
      h={f.contentHeight}
      style={{ flexDirection: portrait ? 'column' : 'row', alignItems: portrait ? 'flex-start' : 'center', justifyContent: portrait ? 'center' : 'space-between', gap: (portrait ? 56 : 40) * u }}
    >
      {text}
      {side && sidePart}
    </FitBox>
  )
}

// ---------- one story ----------

export function HeadlineScene({ item, input, f }: SceneProps) {
  const s = item.scene
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const { u, portrait } = f
  const look = input.look
  const p = look.palette
  const all = stories(input)
  const n = all.findIndex((x) => x.id === item.id) + 1
  const counter = n > 0 && all.length > 1 ? `${String(n).padStart(2, '0')}/${String(all.length).padStart(2, '0')}` : ''
  const size = fitSize(s.heading, portrait ? 78 : 72, 34) * u
  const third = (width: number) => (
    <LowerThird kicker={s.label} counter={counter} heading={s.heading} body={s.body} author={s.author} date={s.value} look={look} u={u} width={width} size={size} />
  )
  const img = item.image
  const zoom = interpolate(frame, [0, item.frames], [1.1, 1.0])
  const appear = enter(frame, fps, 0, { damping: 200, stiffness: 60 })
  if (img && !portrait) {
    return (
      <>
        <AbsoluteFill style={{ opacity: appear }}>
          <Img src={img.src} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom})` }} />
          {/* Darkens the lower left, under the lower third, so it reads on any picture. */}
          <AbsoluteFill style={{ background: `linear-gradient(to top, ${alpha(p.bg, 0.92)} 0%, ${alpha(p.bg, 0.5)} 38%, transparent 70%)` }} />
        </AbsoluteFill>
        <FitBox x={f.left} y={f.top} w={f.contentWidth} h={f.contentHeight} style={{ alignItems: 'flex-end' }}>
          {third(f.contentWidth * 0.72)}
        </FitBox>
      </>
    )
  }
  if (img && portrait) {
    // The picture gives up height when captions sit higher, so the lower third keeps its room.
    const imgH = Math.max(f.height * 0.24, Math.min(f.height * 0.46, f.bottom - 600 * u))
    return (
      <>
        <div style={{ position: 'absolute', left: 0, top: 0, width: f.width, height: imgH, overflow: 'hidden', opacity: appear }}>
          <Img src={img.src} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom})` }} />
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(to bottom, transparent 55%, ${p.bg} 100%)` }} />
        </div>
        <FitBox x={f.left} y={Math.max(f.top, imgH - 90 * u)} w={f.contentWidth} h={f.bottom - Math.max(f.top, imgH - 90 * u)} style={{ alignItems: 'flex-start' }}>
          {third(f.contentWidth)}
        </FitBox>
      </>
    )
  }
  // Without a picture: the story number large in outline, the lower third beside or under it.
  const num = n > 0 ? String(n).padStart(2, '0') : ''
  const pop = enter(frame, fps, 0, { damping: 16, stiffness: 90 })
  const big = num && (
    <span style={{ ...numberStyle(look, (portrait ? 300 : 380) * u), color: 'transparent', WebkitTextStroke: `${4 * u}px ${p.accent}`, opacity: pop, transform: `translateY(${(1 - pop) * 40 * u}px)` }}>{num}</span>
  )
  return (
    <FitBox
      x={f.left}
      y={f.top}
      w={f.contentWidth}
      h={f.contentHeight}
      style={{ flexDirection: portrait ? 'column' : 'row', alignItems: portrait ? 'flex-start' : 'center', justifyContent: 'center', gap: (portrait ? 30 : 60) * u }}
    >
      {big}
      {third(portrait ? f.contentWidth : f.contentWidth * (num ? 0.72 : 0.9))}
    </FitBox>
  )
}

// ---------- key points ----------

export function PointsScene({ item, input, f }: SceneProps) {
  const s = item.scene
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const { u, portrait } = f
  const look = input.look
  const p = look.palette
  const items = s.left.length ? s.left : s.right
  // Points arrive across the first half of the scene, roughly as the narration reaches them.
  const gap = Math.max(6, Math.min(40, (item.frames * 0.5) / Math.max(1, items.length)))
  const rule = enter(frame, fps, 8)
  const head = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 * u, width: portrait ? f.contentWidth : f.contentWidth * 0.34 }}>
      <Kicker text={s.label} look={look} u={u} />
      <Words text={s.heading} delay={2} style={{ ...headingStyle(look, fitSize(s.heading, portrait ? 96 : 96, 18) * u), color: p.ink }} />
      <div style={{ width: 160 * u * rule, height: 12 * u, background: p.accent }} />
    </div>
  )
  const list = (
    <div style={{ display: 'flex', flexDirection: 'column', width: portrait ? f.contentWidth : f.contentWidth * 0.6 }}>
      {items.map((t, i) => {
        const d = 10 + i * gap
        const a = enter(frame, fps, d)
        const tick = enter(frame, fps, d + 6)
        return (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 26 * u,
              padding: `${20 * u}px 0`,
              borderTop: `${2 * u}px solid ${alpha(p.ink, 0.12)}`,
              opacity: a,
              transform: `translateX(${(1 - a) * 60 * u}px)`
            }}
          >
            <span
              style={{
                flexShrink: 0,
                width: 76 * u,
                height: 76 * u,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: p.accent,
                color: '#FFFFFF',
                ...numberStyle(look, 54 * u),
                lineHeight: 1,
                transform: `scale(${0.6 + 0.4 * tick})`
              }}
            >
              {i + 1}
            </span>
            <span style={{ fontFamily: BODY_FONT, fontWeight: 600, fontSize: 44 * u, lineHeight: 1.3, color: p.ink }}>{t}</span>
          </div>
        )
      })}
    </div>
  )
  return (
    <FitBox
      x={f.left}
      y={f.top}
      w={f.contentWidth}
      h={f.contentHeight}
      style={{ flexDirection: portrait ? 'column' : 'row', alignItems: portrait ? 'flex-start' : 'center', justifyContent: portrait ? 'center' : 'space-between', gap: (portrait ? 44 : 40) * u }}
    >
      {head}
      {list}
    </FitBox>
  )
}

// ---------- template chrome ----------

/** Studio light and a faint map grid that stays out of every text zone. */
export function NewsBackdrop({ input, f }: { input: ExplainerInput; f: Frame }) {
  const frame = useCurrentFrame()
  const p = input.look.palette
  const { u } = f
  const drift = (frame * 0.4 * u) % (60 * u)
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 85% 0%, ${alpha(p.accent2, p.dark ? 0.1 : 0.08)} 0%, transparent 50%)` }} />
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 0% 100%, ${alpha(p.accent, p.dark ? 0.12 : 0.06)} 0%, transparent 45%)` }} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `linear-gradient(${alpha(p.ink, 0.07)} ${1.5 * u}px, transparent ${1.5 * u}px), linear-gradient(90deg, ${alpha(p.ink, 0.07)} ${1.5 * u}px, transparent ${1.5 * u}px)`,
          backgroundSize: `${60 * u}px ${60 * u}px`,
          backgroundPosition: `${drift}px 0`,
          ...holeMask(f.width, f.height, textZones(f), 40 * u)
        }}
      />
    </AbsoluteFill>
  )
}

/** Channel bug (desk + date) after the opener, and a ticker of the stories under the picture in 16:9. */
export function NewsChrome({ input, f, logoRoom }: { input: ExplainerInput; f: Frame; logoRoom: number }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const p = input.look.palette
  const { u, portrait } = f
  const { desk, date } = newsDesk(input)
  const first = input.scenes[0]
  const bugIn = first ? enter(frame, fps, first.frames) : 1
  const share = Math.min(1, frame / Math.max(1, input.totalFrames - 1))
  const headlines = stories(input).map((s) => s.scene.heading).filter(Boolean)
  const tab: CSSProperties = { padding: `${8 * u}px ${16 * u}px`, fontFamily: BODY_FONT, fontWeight: 800, fontSize: 24 * u, letterSpacing: '0.1em', textTransform: 'uppercase', lineHeight: 1.15 }
  const bug = (desk || date) && (
    <div style={{ position: 'absolute', left: f.left, top: (portrait ? 112 : 38) * u, display: 'flex', opacity: bugIn, transform: `translateY(${(1 - bugIn) * -20 * u}px)`, maxWidth: f.contentWidth - logoRoom }}>
      {desk && <span style={{ ...tab, background: p.accent, color: '#FFFFFF' }}>{desk}</span>}
      {date && <span style={{ ...tab, background: p.dark ? '#05080F' : p.ink, color: p.dark ? p.ink : p.bg, fontFamily: MONO_FONT, fontWeight: 700, letterSpacing: '0.04em' }}>{date}</span>}
    </div>
  )
  if (portrait || !headlines.length)
    return (
      <>
        {bug}
        <div style={{ position: 'absolute', left: 0, top: 0, height: 6 * u, width: `${share * 100}%`, background: p.accent }} />
      </>
    )
  // The ticker never wraps around: it is long enough for the whole video, so it scrolls without a jump.
  const h = 46 * u
  const speed = 3 * u
  const item = headlines.join('     ■     ') + '     ■     '
  const repeats = Math.max(2, Math.ceil((f.width + speed * input.totalFrames) / Math.max(1, item.length * 24 * u * 0.45)) + 1)
  return (
    <>
      {bug}
      <div style={{ position: 'absolute', left: 0, bottom: 0, width: f.width, height: h, display: 'flex', background: p.dark ? '#05080F' : p.ink, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: 4 * u, width: `${share * 100}%`, background: p.accent }} />
        <div style={{ flexShrink: 0, zIndex: 1, display: 'flex', alignItems: 'center', padding: `0 ${20 * u}px`, background: p.accent2, color: onColor(p.accent2), ...tab, fontSize: 22 * u }}>
          {desk || '■'}
        </div>
        <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              height: h,
              display: 'flex',
              alignItems: 'center',
              whiteSpace: 'pre',
              fontFamily: BODY_FONT,
              fontWeight: 600,
              fontSize: 24 * u,
              color: p.dark ? p.ink : p.bg,
              transform: `translateX(${-frame * speed}px)`
            }}
          >
            {item.repeat(repeats)}
          </div>
        </div>
      </div>
    </>
  )
}

/** Cut: a red ticker band sweeps across with the next story's category on it. */
export function NewsCut({ input, d, next }: { input: ExplainerInput; d: number; next: string }) {
  const p = input.look.palette
  const u = Math.min(input.width, input.height) / 1080
  const pos = interpolate(d, [-8, 8], [1.15, -1.15])
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${pos * 100 - 4}%`, width: '6%', background: p.accent2 }} />
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: `${pos * 100 + 2}%`,
          width: '110%',
          background: p.accent,
          display: 'flex',
          alignItems: 'center',
          paddingLeft: '8%'
        }}
      >
        {next && (
          <span style={{ ...numberStyle(input.look, 150 * u), lineHeight: 1, letterSpacing: '0.02em', textTransform: 'uppercase', color: '#FFFFFF', whiteSpace: 'nowrap' }}>
            {next}
          </span>
        )}
      </div>
    </AbsoluteFill>
  )
}
