import type { CSSProperties, ReactNode } from 'react'
import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import type { ExplainerInput, ExplainerSceneInput } from '@shared/explainer'
import { alpha, BODY_FONT, BOUNCY, EMOJI_FONT, enter, fitSize, headingStyle, numberStyle, onColor, type Frame } from './layout'
import { Kicker } from './news'
import { CodeWindow, FitBox, Picture, Pill, Rise, Words } from './parts'

export interface SceneProps {
  item: ExplainerSceneInput
  input: ExplainerInput
  f: Frame
  /** Position among the scenes of the same type (1-based) and how many there are, e.g. step 2 of 5. */
  nth: { n: number; total: number }
}

const body = (u: number, size: number, color: string): CSSProperties => ({
  fontFamily: BODY_FONT,
  fontWeight: 500,
  fontSize: size * u,
  lineHeight: 1.42,
  color
})

/** Content box of a scene: the frame's safe area, clear of the captions. Too-tall content shrinks to fit. */
export function Area({ f, children, style }: { f: Frame; children: ReactNode; style?: CSSProperties }) {
  return (
    <FitBox x={f.left} y={f.top} w={f.contentWidth} h={f.contentHeight} style={style}>
      {children}
    </FitBox>
  )
}

function Label({ text, input, u, delay = 0, center = false }: { text: string; input: ExplainerInput; u: number; delay?: number; center?: boolean }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  if (!text) return null
  const look = input.look
  const p = look.palette
  const a = enter(frame, fps, delay)
  if (input.templateId === 'tips')
    return (
      <span
        style={{
          alignSelf: center ? 'center' : 'flex-start',
          display: 'inline-block',
          padding: `${10 * u}px ${24 * u}px`,
          background: p.surface,
          color: p.ink,
          border: `${4 * u}px solid ${p.ink}`,
          boxShadow: `${6 * u}px ${6 * u}px 0 ${p.ink}`,
          borderRadius: 12 * u,
          fontFamily: BODY_FONT,
          fontWeight: 800,
          fontSize: 28 * u,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          opacity: a,
          transform: `rotate(${-3 * a}deg) scale(${0.8 + 0.2 * a})`
        }}
      >
        {text}
      </span>
    )
  if (input.templateId === 'news')
    return (
      <span style={{ alignSelf: center ? 'center' : 'flex-start' }}>
        <Kicker text={text} look={look} u={u} delay={delay} />
      </span>
    )
  if (input.templateId === 'compare')
    return (
      <span style={{ alignSelf: center ? 'center' : 'flex-start', opacity: a, transform: `scale(${0.85 + 0.15 * a})` }}>
        <Pill look={look} u={u} style={{ background: p.ink, color: p.bg }}>
          {text}
        </Pill>
      </span>
    )
  if (input.templateId === 'quote')
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 18 * u, opacity: a, ...body(u, 26, p.accent), fontWeight: 600, letterSpacing: '0.24em', textTransform: 'uppercase' }}>
        <span style={{ width: 56 * u * a, height: 2 * u, background: p.accent }} />
        {text}
      </span>
    )
  return (
    <span style={{ alignSelf: center ? 'center' : 'flex-start', opacity: a, transform: `translateX(${(1 - a) * -30 * u}px)` }}>
      <Pill look={look} u={u} filled={input.templateId === 'facts'}>
        {input.templateId === 'tutorial' && <span style={{ width: 12 * u, height: 12 * u, borderRadius: '50%', background: p.accent }} />}
        {text}
      </Pill>
    </span>
  )
}

/** A short accent bar that grows under a heading. */
function Underline({ input, u, delay }: { input: ExplainerInput; u: number; delay: number }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const w = enter(frame, fps, delay)
  return <div style={{ width: 170 * u * w, height: 12 * u, borderRadius: 6 * u, background: input.look.palette.accent }} />
}

// ---------- title ----------

export function TitleScene({ item, input, f }: SceneProps) {
  const s = item.scene
  const { u, portrait } = f
  const look = input.look
  const p = look.palette
  const centered = input.templateId === 'quote' && !item.image
  const steps = input.scenes.filter((x) => x.scene.type === 'step').length
  const showSteps = !item.image && input.templateId === 'tutorial' && steps > 1 && !portrait
  const textWidth = item.image && !portrait ? f.contentWidth * 0.54 : showSteps ? f.contentWidth * 0.66 : f.contentWidth
  const size = fitSize(s.heading, portrait ? 112 : 128, portrait ? 22 : 26)
  const text = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 34 * u, width: textWidth, alignItems: centered ? 'center' : 'flex-start', textAlign: centered ? 'center' : 'left' }}>
      <Label text={s.label} input={input} u={u} />
      <Words text={s.heading} delay={4} style={{ ...headingStyle(look, size * u), color: p.ink }} blur={input.templateId === 'quote'} />
      {input.templateId !== 'quote' && <Underline input={input} u={u} delay={14} />}
      {s.body && (
        <Rise delay={16}>
          <div style={{ ...body(u, portrait ? 40 : 42, p.muted), maxWidth: 1100 * u }}>{s.body}</div>
        </Rise>
      )}
    </div>
  )
  if (showSteps)
    return (
      <Area f={f} style={{ alignItems: 'center', justifyContent: 'space-between' }}>
        {text}
        <StepCount n={steps} input={input} u={u} />
      </Area>
    )
  if (!item.image) return <Area f={f} style={{ alignItems: 'center', justifyContent: centered ? 'center' : 'flex-start' }}>{text}</Area>
  const imgW = portrait ? f.contentWidth : f.contentWidth * 0.4
  const imgH = portrait ? Math.min(f.contentHeight * 0.4, imgW * 0.75) : Math.min(f.contentHeight * 0.8, imgW * 1.05)
  return (
    <Area f={f} style={{ flexDirection: portrait ? 'column' : 'row', alignItems: portrait ? 'flex-start' : 'center', justifyContent: 'space-between', gap: 48 * u }}>
      {text}
      <Picture image={item.image} look={look} u={u} width={imgW} height={imgH} delay={10} sceneFrames={item.frames} screenshot={s.imageMode === 'upload'} highlight={s.highlight} />
    </Area>
  )
}

/** How many steps the tutorial has, as a big outlined number: the viewer knows what is coming. */
function StepCount({ n, input, u }: { n: number; input: ExplainerInput; u: number }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const look = input.look
  const p = look.palette
  const a = enter(frame, fps, 10, { damping: 16, stiffness: 90 })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', opacity: a, transform: `translateX(${(1 - a) * 60 * u}px)` }}>
      <span style={{ ...numberStyle(look, 380 * u), color: 'transparent', WebkitTextStroke: `${4 * u}px ${p.accent}` }}>{String(n).padStart(2, '0')}</span>
      <span style={{ ...body(u, 30, p.muted), fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.18em', textTransform: 'uppercase', marginTop: 10 * u }}>langkah</span>
    </div>
  )
}

// ---------- step ----------

export function StepScene({ item, input, f, nth }: SceneProps) {
  const s = item.scene
  const { u, portrait } = f
  const look = input.look
  const p = look.palette
  // A screenshot the user added wins over code the AI wrote: it is the more specific instruction.
  const shot = s.imageMode === 'upload' && !!item.image
  const hasCode = !shot && s.codeKind !== 'none' && !!s.code.trim()
  const media = hasCode || !!item.image
  const n = (s.value || String(nth.n)).padStart(2, '0')
  const textW = media && !portrait ? f.contentWidth * 0.4 : f.contentWidth
  const headSize = fitSize(s.heading, media ? (portrait ? 84 : 76) : 100, media ? 26 : 30)
  const text = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26 * u, width: textW }}>
      <Rise delay={0} distance={30 * u}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 18 * u }}>
          <span style={{ ...numberStyle(look, (portrait ? 130 : 150) * u), color: p.accent }}>{n}</span>
          {nth.total > 1 && <span style={{ ...numberStyle(look, 44 * u), color: alpha(p.ink, 0.35) }}>/{String(nth.total).padStart(2, '0')}</span>}
        </div>
      </Rise>
      {s.label && <Label text={s.label} input={input} u={u} delay={4} />}
      <Words text={s.heading} delay={5} style={{ ...headingStyle(look, headSize * u), color: p.ink }} />
      {s.body && (
        <Rise delay={14}>
          <div style={body(u, portrait ? 38 : 36, p.muted)}>{s.body}</div>
        </Rise>
      )}
    </div>
  )
  const mediaW = portrait ? f.contentWidth : f.contentWidth * 0.55
  const mediaH = portrait ? f.contentHeight * 0.48 : f.contentHeight
  return (
    <Area
      f={f}
      style={{ flexDirection: portrait ? 'column' : 'row', alignItems: portrait ? 'stretch' : 'center', justifyContent: portrait ? 'center' : media ? 'space-between' : 'flex-start', gap: (portrait ? 64 : 44) * u }}
    >
      {text}
      {hasCode ? (
        <div style={{ display: 'flex', alignItems: 'center', height: portrait ? undefined : mediaH }}>
          <CodeWindow code={s.code} kind={s.codeKind} language={s.codeLanguage} look={look} u={u} width={mediaW} maxHeight={mediaH} delay={8} sceneFrames={item.frames} />
        </div>
      ) : item.image ? (
        <Picture
          image={item.image}
          look={look}
          u={u}
          width={mediaW}
          height={Math.min(mediaH, mediaW * (s.imageMode === 'upload' ? 0.72 : 0.62))}
          delay={8}
          sceneFrames={item.frames}
          screenshot={s.imageMode === 'upload'}
          highlight={s.highlight}
        />
      ) : null}
    </Area>
  )
}

// ---------- tip ----------

export function TipScene({ item, input, f, nth }: SceneProps) {
  const s = item.scene
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const { u, portrait } = f
  const look = input.look
  const p = look.palette
  const brutal = input.templateId === 'tips'
  const num = s.value || (brutal ? String(nth.n) : '')
  const pop = enter(frame, fps, 0, BOUNCY)
  const cardW = portrait ? f.contentWidth : num ? f.contentWidth * 0.66 : f.contentWidth * 0.8
  const headSize = fitSize(s.heading, portrait ? 84 : 80, 24)
  const imgH = item.image ? Math.min(portrait ? 420 * u : 330 * u, (cardW - 80 * u) * 0.5) : 0
  const card = (
    <div
      style={{
        width: cardW,
        display: 'flex',
        flexDirection: 'column',
        gap: 26 * u,
        padding: `${46 * u}px ${52 * u}px`,
        background: p.surface,
        borderRadius: 32 * u,
        border: brutal ? `${5 * u}px solid ${p.ink}` : `${2 * u}px solid ${alpha(p.ink, 0.08)}`,
        boxShadow: brutal ? `${16 * u}px ${16 * u}px 0 ${p.ink}` : `0 ${30 * u}px ${70 * u}px ${alpha('#000000', p.dark ? 0.4 : 0.12)}`,
        opacity: Math.min(1, pop * 1.4),
        transform: `translateY(${(1 - pop) * 80 * u}px) rotate(${brutal ? (1 - pop) * 4 - 1 : 0}deg)`
      }}
    >
      {item.image && (
        <div style={{ borderRadius: 18 * u, overflow: 'hidden', height: imgH, border: brutal ? `${4 * u}px solid ${p.ink}` : undefined }}>
          <Img src={item.image.src} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${interpolate(frame, [0, item.frames], [1, 1.06])})` }} />
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 28 * u }}>
        {s.icon && (
          <span
            style={{
              flexShrink: 0,
              width: 116 * u,
              height: 116 * u,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: brutal ? p.bg : alpha(p.accent, 0.16),
              border: brutal ? `${4 * u}px solid ${p.ink}` : undefined,
              fontFamily: EMOJI_FONT,
              fontSize: 62 * u,
              transform: `scale(${enter(frame, fps, 8, BOUNCY)}) rotate(${(1 - enter(frame, fps, 8)) * -30}deg)`
            }}
          >
            {s.icon}
          </span>
        )}
        <Words text={s.heading} delay={6} style={{ ...headingStyle(look, headSize * u), color: p.ink }} />
      </div>
      {s.body && (
        <Rise delay={14}>
          <div style={body(u, portrait ? 38 : 36, p.dark ? p.muted : alpha(p.ink, 0.72))}>{s.body}</div>
        </Rise>
      )}
    </div>
  )
  const numSize = portrait ? 300 : 420
  return (
    <Area
      f={f}
      style={{ flexDirection: portrait ? 'column' : 'row', alignItems: portrait ? 'flex-start' : 'center', justifyContent: portrait || !num ? 'center' : 'space-between', gap: (portrait ? 50 : 30) * u }}
    >
      {num && (
        <span
          style={{
            ...numberStyle(look, numSize * u),
            color: brutal ? p.accent : p.accent,
            textShadow: brutal ? `${12 * u}px ${12 * u}px 0 ${p.ink}` : undefined,
            WebkitTextStroke: brutal ? `${5 * u}px ${p.ink}` : undefined,
            transform: `scale(${0.6 + 0.4 * pop}) rotate(${(1 - pop) * -12}deg)`,
            opacity: Math.min(1, pop * 2),
            paddingLeft: portrait ? 0 : 20 * u,
            marginBottom: portrait ? -20 * u : 0
          }}
        >
          {num}
        </span>
      )}
      {card}
    </Area>
  )
}

// ---------- fact ----------

/** "1,6 juta" → its number part, so the figure can count up; years and odd values just appear. */
function countable(value: string): { prefix: string; n: number; decimals: number; sep: ',' | '.'; suffix: string } | null {
  const m = /^(\D*?)(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)(.*)$/.exec(value)
  if (!m) return null
  const raw = m[2]
  const grouped = /^\d{1,3}([.,]\d{3})+$/.test(raw)
  const sep: ',' | '.' = raw.includes(',') && !grouped ? ',' : '.'
  const n = grouped ? Number(raw.replace(/[.,]/g, '')) : Number(raw.replace(',', '.'))
  if (!Number.isFinite(n)) return null
  if (!m[1] && !m[3].trim() && n >= 1000 && n <= 2100 && Number.isInteger(n)) return null
  const decimals = grouped ? 0 : (raw.split(/[.,]/)[1]?.length ?? 0)
  return { prefix: m[1], n, decimals, sep, suffix: m[3] }
}

function CountUp({ value, delay, style }: { value: string; delay: number; style: CSSProperties }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const c = countable(value)
  const p = enter(frame, fps, delay, { damping: 200, stiffness: 40, mass: 1 })
  if (!c) return <span style={{ ...style, opacity: p, filter: `blur(${(1 - p) * 12}px)` }}>{value}</span>
  const v = c.n * p
  let text = v.toFixed(c.decimals)
  if (c.decimals === 0 && c.n >= 1000) text = Math.round(v).toLocaleString('en-US').replace(/,/g, c.sep === ',' ? '.' : ',')
  else if (c.sep === ',') text = text.replace('.', ',')
  return (
    <span style={{ ...style, opacity: Math.min(1, p * 3) }}>
      {c.prefix}
      {text}
      {c.suffix}
    </span>
  )
}

export function FactScene({ item, input, f }: SceneProps) {
  const s = item.scene
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const { u, portrait } = f
  const look = input.look
  const p = look.palette
  const img = item.image
  const colWidth = img && !portrait ? f.right - (f.width * 0.5 + 40 * u) : f.contentWidth * (portrait ? 1 : 0.8)
  // The figure stays on one line: as large as the template wants, but never wider than its column.
  const charWidth = look.number.upper ? 0.46 : 0.64
  const valuePx = Math.min((portrait ? 230 : img ? 220 : 260) * u, colWidth / (Math.max(3, s.value.length) * charWidth * look.number.scale))
  const text = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 * u, width: colWidth }}>
      <Label text={s.label} input={input} u={u} />
      {s.value && (
        <CountUp value={s.value} delay={6} style={{ ...numberStyle(look, valuePx), color: p.accent2, display: 'block', whiteSpace: 'nowrap', marginTop: 10 * u }} />
      )}
      <Words text={s.heading} delay={10} style={{ ...headingStyle(look, fitSize(s.heading, portrait ? 76 : 72, 34) * u), color: p.ink }} />
      {s.body && (
        <Rise delay={18}>
          <div style={body(u, portrait ? 36 : 34, p.muted)}>{s.body}</div>
        </Rise>
      )}
      {s.author && (
        <Rise delay={24}>
          <div style={{ ...body(u, 24, alpha(p.ink, 0.5)), letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>Sumber: {s.author}</div>
        </Rise>
      )}
    </div>
  )
  if (!img) return <Area f={f} style={{ alignItems: 'center' }}>{text}</Area>
  // The picture bleeds off the frame edge and melts into the background, like a film still. In 9:16 it gives up
  // height when captions sit higher, so the text below keeps room for the figure and the fact.
  const shotH = Math.max(f.height * 0.24, Math.min(f.height * 0.46, f.bottom - 640 * u))
  const textTop = Math.max(f.top, shotH - f.height * 0.02)
  const zoom = interpolate(frame, [0, item.frames], [1.12, 1.0])
  const panel: CSSProperties = portrait
    ? { position: 'absolute', left: 0, top: 0, width: f.width, height: shotH }
    : { position: 'absolute', left: 0, top: 0, width: f.width * 0.5, height: f.height }
  const fade = portrait
    ? `linear-gradient(to bottom, ${alpha(p.bg, 0)} 45%, ${p.bg} 100%)`
    : `linear-gradient(to right, ${alpha(p.bg, 0)} 50%, ${p.bg} 100%)`
  const appear = enter(frame, fps, 0)
  return (
    <>
      <div style={{ ...panel, overflow: 'hidden', opacity: appear }}>
        <Img src={img.src} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom})` }} />
        <div style={{ position: 'absolute', inset: 0, background: fade }} />
      </div>
      {portrait ? (
        <FitBox x={f.left} y={textTop} w={f.contentWidth} h={f.bottom - textTop} style={{ alignItems: 'center' }}>
          {text}
        </FitBox>
      ) : (
        <FitBox x={f.width * 0.5 + 40 * u} y={f.top} w={f.right - (f.width * 0.5 + 40 * u)} h={f.contentHeight} style={{ alignItems: 'center' }}>
          {text}
        </FitBox>
      )}
    </>
  )
}

// ---------- quote ----------

export function QuoteScene({ item, input, f }: SceneProps) {
  const s = item.scene
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const { u, portrait } = f
  const look = input.look
  const p = look.palette
  const size = fitSize(s.heading, portrait ? 86 : 92, 70, 0.5)
  const words = s.heading.split(/\s+/).filter(Boolean).length
  const after = 6 + words * 2.6
  const mark = enter(frame, fps, 0, { damping: 18, stiffness: 90 })
  return (
    <>
      {item.image && (
        <AbsoluteFill style={{ opacity: enter(frame, fps, 0, { damping: 200, stiffness: 40 }) }}>
          <Img src={item.image.src} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${interpolate(frame, [0, item.frames], [1.04, 1.12])})` }} />
          <AbsoluteFill style={{ background: `linear-gradient(${portrait ? 180 : 100}deg, ${alpha(p.bg, 0.92)} 20%, ${alpha(p.bg, 0.62)} 100%)` }} />
        </AbsoluteFill>
      )}
      <Area f={f} style={{ alignItems: 'center' }}>
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 40 * u, width: portrait ? f.contentWidth : f.contentWidth * 0.78, paddingTop: 90 * u }}>
          <span
            style={{
              position: 'absolute',
              left: -12 * u,
              top: -110 * u,
              fontFamily: "'DM Serif Display', serif",
              fontSize: 340 * u,
              lineHeight: 1,
              color: p.accent,
              opacity: 0.9 * mark,
              transform: `translateY(${(1 - mark) * 40 * u}px)`
            }}
          >
            “
          </span>
          <Words text={s.heading} delay={6} stagger={2.6} blur style={{ ...headingStyle(look, size * u), lineHeight: 1.18, color: p.ink }} />
          {s.author && (
            <Rise delay={after}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 * u, ...body(u, 28, p.accent), fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
                <span style={{ width: 64 * u, height: 3 * u, background: p.accent }} />
                {s.author}
              </div>
            </Rise>
          )}
          {s.body && (
            <Rise delay={after + 14}>
              <div style={{ ...body(u, portrait ? 34 : 32, p.muted), maxWidth: 1000 * u }}>{s.body}</div>
            </Rise>
          )}
        </div>
      </Area>
    </>
  )
}

// ---------- compare ----------

function Mark({ good, u, color }: { good: boolean; u: number; color: string }) {
  return (
    <svg width={44 * u} height={44 * u} viewBox="0 0 44 44" style={{ flexShrink: 0 }}>
      <circle cx="22" cy="22" r="22" fill={color} />
      {good ? (
        <path d="M13 22.5l6 6 12-13" stroke={onColor(color)} strokeWidth="4.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M15 15l14 14M29 15L15 29" stroke={onColor(color)} strokeWidth="4.5" strokeLinecap="round" />
      )}
    </svg>
  )
}

export function CompareScene({ item, input, f }: SceneProps) {
  const s = item.scene
  const { u, portrait } = f
  const look = input.look
  const p = look.palette
  const brutal = input.templateId === 'tips'
  const bad = p.dark ? '#5B6270' : '#9AA0AA'
  const col = (title: string, items: string[], good: boolean, delay: number) => (
    <Rise delay={delay} distance={50 * u} style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 24 * u,
          padding: `${38 * u}px ${42 * u}px`,
          borderRadius: 28 * u,
          background: good ? p.surface : alpha(p.surface, p.dark ? 0.55 : 0.6),
          border: brutal ? `${5 * u}px solid ${p.ink}` : `${3 * u}px solid ${good ? p.accent : alpha(p.ink, 0.1)}`,
          boxShadow: brutal ? `${12 * u}px ${12 * u}px 0 ${p.ink}` : undefined
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 * u }}>
          <Mark good={good} u={u * 1.2} color={good ? p.accent : bad} />
          <span style={{ ...headingStyle(look, 50 * u), color: p.ink }}>{title || (good ? 'Lakukan' : 'Hindari')}</span>
        </div>
        {items.map((t, i) => (
          <Rise key={i} delay={delay + 8 + i * 5}>
            <div style={{ display: 'flex', gap: 16 * u, alignItems: 'flex-start' }}>
              <span style={{ marginTop: 18 * u, width: 12 * u, height: 12 * u, borderRadius: '50%', background: good ? p.accent : bad, flexShrink: 0 }} />
              <span style={body(u, portrait ? 36 : 34, p.ink)}>{t}</span>
            </div>
          </Rise>
        ))}
      </div>
    </Rise>
  )
  return (
    <Area f={f} style={{ flexDirection: 'column', justifyContent: 'center', gap: 50 * u }}>
      {s.heading && <Words text={s.heading} style={{ ...headingStyle(look, fitSize(s.heading, portrait ? 80 : 76, 30) * u), color: p.ink }} />}
      <div style={{ display: 'flex', flexDirection: portrait ? 'column' : 'row', gap: 40 * u }}>
        {col(s.leftTitle, s.left, false, 6)}
        {col(s.rightTitle, s.right, true, 12)}
      </div>
    </Area>
  )
}

// ---------- outro ----------

export function OutroScene({ item, input, f }: SceneProps) {
  const s = item.scene
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const { u, portrait } = f
  const look = input.look
  const p = look.palette
  // A soft pulse of light behind the closing line: no hard edge ever runs through the letters.
  const glow = (delay: number) => {
    const t = interpolate(frame - delay, [0, 46], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    return (
      <div
        style={{
          position: 'absolute',
          left: (f.left + f.right) / 2 - 600 * u,
          top: (f.top + f.bottom) / 2 - 600 * u,
          width: 1200 * u,
          height: 1200 * u,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${alpha(p.accent, (p.dark ? 0.2 : 0.16) * (1 - 0.6 * t))} 0%, transparent 62%)`,
          transform: `scale(${0.45 + 0.7 * t})`
        }}
      />
    )
  }
  return (
    <>
      {glow(0)}
      {glow(14)}
      <Area f={f} style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 36 * u, textAlign: 'center' }}>
        {input.logo && (
          <Img src={input.logo} style={{ height: 120 * u, maxWidth: 420 * u, objectFit: 'contain', opacity: enter(frame, fps, 0), transform: `scale(${enter(frame, fps, 0, BOUNCY)})` }} />
        )}
        <Label text={s.label} input={input} u={u} delay={2} center />
        <Words
          text={s.heading}
          delay={4}
          blur={input.templateId === 'quote'}
          style={{ ...headingStyle(look, fitSize(s.heading, portrait ? 104 : 116, 26) * u), color: p.ink, maxWidth: f.contentWidth * 0.9 }}
        />
        {s.body && (
          <Rise delay={16}>
            <div style={{ ...body(u, portrait ? 40 : 40, p.muted), maxWidth: 1100 * u }}>{s.body}</div>
          </Rise>
        )}
      </Area>
    </>
  )
}
