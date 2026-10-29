import type { CSSProperties, ReactNode } from 'react'
import { AbsoluteFill, Html5Audio, Img, interpolate, random, Sequence, useCurrentFrame, useVideoConfig } from 'remotion'
import { captionAt, chunkWords } from '@shared/captions'
import { lookFonts, type ExplainerInput, type ExplainerSceneInput } from '@shared/explainer'
import { useFonts } from '../fonts'
import { alpha, BODY_FONT, enter, frameOf, type Frame } from './layout'
import { CompareScene, FactScene, OutroScene, QuoteScene, StepScene, TipScene, TitleScene, type SceneProps } from './scenes'

/**
 * The explainer video. The app's Player and the MP4 render both mount this component with props from
 * buildExplainerInput (src/shared/explainer.ts); nothing here may depend on where it runs.
 */

// The app's Tailwind preflight reaches into the Player but not into the headless render, so the composition
// brings its own reset: both then lay out text and boxes the same way.
const RESET = `
.sm-x, .sm-x * { box-sizing: border-box; margin: 0; padding: 0; border: 0 solid; }
.sm-x { font-family: Poppins, 'Segoe UI', sans-serif; line-height: 1.2; -webkit-font-smoothing: antialiased; text-rendering: geometricPrecision; }
.sm-x img, .sm-x svg { display: block; max-width: none; }
`

const GRAIN = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0.9 0'/></filter><rect width='240' height='240' filter='url(#n)'/></svg>"
)}")`

// ---------- background ----------

function Backdrop({ input, f }: { input: ExplainerInput; f: Frame }) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const p = input.look.palette
  const { u } = f
  const t = frame / Math.max(1, durationInFrames)
  const fill: CSSProperties = { position: 'absolute', inset: 0 }
  if (input.templateId === 'tutorial') {
    return (
      <>
        <div style={{ ...fill, backgroundImage: `radial-gradient(${alpha(p.ink, p.dark ? 0.1 : 0.12)} ${1.6 * u}px, transparent ${1.9 * u}px)`, backgroundSize: `${44 * u}px ${44 * u}px` }} />
        <div
          style={{
            ...fill,
            background: `radial-gradient(circle at ${72 + 10 * t}% ${18 + 8 * Math.sin(t * 6)}%, ${alpha(p.accent, p.dark ? 0.16 : 0.12)} 0%, transparent 42%)`
          }}
        />
        <div style={{ ...fill, background: `radial-gradient(circle at 8% 100%, ${alpha(p.accent2, 0.12)} 0%, transparent 40%)` }} />
      </>
    )
  }
  if (input.templateId === 'tips') {
    const d = 760 * u
    return (
      <>
        <div
          style={{
            position: 'absolute',
            width: d,
            height: d,
            borderRadius: '50%',
            right: -d * 0.28,
            bottom: -d * 0.42,
            background: p.accent2,
            opacity: p.dark ? 0.55 : 0.9,
            transform: `translate(${Math.sin(frame / 70) * 20 * u}px, ${Math.cos(frame / 90) * 16 * u}px)`
          }}
        />
        <div
          style={{
            position: 'absolute',
            width: d * 0.62,
            height: d * 0.62,
            borderRadius: '50%',
            left: -d * 0.2,
            top: -d * 0.24,
            border: `${5 * u}px dashed ${alpha(p.ink, 0.35)}`,
            transform: `rotate(${frame * 0.25}deg)`
          }}
        />
        {Array.from({ length: 7 }, (_, i) => {
          // Confetti stays in the side margins, where it cannot sit between the letters of a heading.
          const side = i % 2 ? random(`x${i}`) * 0.08 : 0.92 + random(`x${i}`) * 0.06
          const x = side * f.width
          const y = random(`y${i}`) * f.height
          const s = (14 + random(`s${i}`) * 18) * u
          const colors = [p.accent, p.ink, p.surface]
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: x,
                top: y + Math.sin(frame / 30 + i) * 10 * u,
                width: s,
                height: s,
                borderRadius: i % 2 ? '50%' : 3 * u,
                background: colors[i % 3],
                opacity: 0.55,
                transform: `rotate(${frame * (i % 2 ? 1 : -1) + i * 30}deg)`
              }}
            />
          )
        })}
      </>
    )
  }
  if (input.templateId === 'facts') {
    return (
      <>
        <div
          style={{
            ...fill,
            background: `radial-gradient(ellipse at ${20 + 60 * t}% ${30 + 20 * Math.sin(t * 5)}%, ${alpha(p.accent, 0.2)} 0%, transparent 46%)`
          }}
        />
        <div style={{ ...fill, background: `radial-gradient(ellipse at 50% 50%, transparent 52%, ${alpha('#000000', p.dark ? 0.62 : 0.18)} 100%)` }} />
        <div style={{ ...fill, backgroundImage: GRAIN, opacity: p.dark ? 0.09 : 0.07, mixBlendMode: 'overlay' }} />
      </>
    )
  }
  return (
    <>
      <div style={{ ...fill, background: `radial-gradient(circle at ${25 + 10 * Math.sin(t * 4)}% ${30 + 10 * t}%, ${alpha(p.accent, 0.2)} 0%, transparent 50%)` }} />
      <div style={{ ...fill, background: `radial-gradient(circle at ${80 - 8 * t}% 85%, ${alpha(p.accent2, 0.16)} 0%, transparent 45%)` }} />
      <div style={{ ...fill, backgroundImage: GRAIN, opacity: 0.08, mixBlendMode: 'overlay' }} />
    </>
  )
}

// ---------- scenes and transitions ----------

const SCENES: Record<string, (p: SceneProps) => ReactNode> = {
  title: TitleScene,
  step: StepScene,
  tip: TipScene,
  fact: FactScene,
  quote: QuoteScene,
  compare: CompareScene,
  outro: OutroScene
}

/** How a scene arrives and leaves; each template moves in its own way. */
function SceneShell({ input, item, children }: { input: ExplainerInput; item: ExplainerSceneInput; children: ReactNode }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const u = Math.min(input.width, input.height) / 1080
  const outF = input.templateId === 'quote' ? 14 : 9
  const x = interpolate(frame, [item.frames - outF, item.frames], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const e = enter(frame, fps, 0)
  let style: CSSProperties
  if (input.templateId === 'tips') style = { opacity: 1 - x, transform: `scale(${(0.94 + 0.06 * e) * (1 + 0.05 * x)})` }
  else if (input.templateId === 'facts') style = { opacity: Math.min(1, e * 1.6) * (1 - x), transform: `scale(${1.06 - 0.06 * e})` }
  else if (input.templateId === 'quote')
    style = { opacity: interpolate(frame, [0, 18], [0, 1], { extrapolateRight: 'clamp' }) * (1 - x), transform: `scale(${1.02 - 0.02 * e})` }
  else style = { opacity: Math.min(1, e * 1.5) * (1 - x), transform: `translateY(${(1 - e) * 40 * u - x * 34 * u}px)` }
  return <AbsoluteFill style={style}>{children}</AbsoluteFill>
}

/** A colored panel (tips) or a flash (facts) right over each cut. */
function Cuts({ input }: { input: ExplainerInput }) {
  const frame = useCurrentFrame()
  const p = input.look.palette
  if (input.templateId !== 'tips' && input.templateId !== 'facts') return null
  for (const s of input.scenes.slice(1)) {
    const d = frame - s.from
    if (input.templateId === 'tips' && d >= -7 && d <= 7) {
      const pos = interpolate(d, [-7, 7], [-1.3, 1.3])
      return (
        <AbsoluteFill style={{ overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-20%', height: '140%', width: '120%', left: `${pos * 100 - 10}%`, background: p.accent2, transform: 'skewX(-14deg)' }} />
          <div style={{ position: 'absolute', top: '-20%', height: '140%', width: '12%', left: `${pos * 100 + 108}%`, background: p.ink, transform: 'skewX(-14deg)' }} />
        </AbsoluteFill>
      )
    }
    if (input.templateId === 'facts' && d >= -2 && d <= 6) {
      return <AbsoluteFill style={{ background: '#FFFFFF', opacity: interpolate(d, [-2, 0, 6], [0, 0.5, 0], { extrapolateRight: 'clamp' }) }} />
    }
  }
  return null
}

// ---------- overlays ----------

function Captions({ input, f }: { input: ExplainerInput; f: Frame }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  if (!input.captions) return null
  const item = input.scenes.find((s) => frame >= s.from && frame < s.from + s.frames)
  if (!item || !item.words.length) return null
  const hit = captionAt(chunkWords(item.words), (frame - item.from) / fps)
  if (!hit) return null
  const p = input.look.palette
  const { u, portrait } = f
  const boxed = input.templateId === 'tutorial' || input.templateId === 'tips'
  const lit = input.templateId === 'tips' ? p.bg : input.templateId === 'facts' ? p.accent2 : p.accent
  const style: CSSProperties = {
    display: 'inline-block',
    maxWidth: f.width * (portrait ? 0.86 : 0.74),
    padding: boxed ? `${14 * u}px ${30 * u}px` : 0,
    borderRadius: 20 * u,
    background: boxed ? (input.templateId === 'tips' ? p.ink : alpha('#05070A', 0.82)) : undefined,
    fontFamily: BODY_FONT,
    fontWeight: input.templateId === 'quote' ? 600 : 800,
    fontSize: (portrait ? 52 : 46) * u,
    lineHeight: 1.3,
    color: '#FFFFFF',
    textAlign: 'center',
    textTransform: input.templateId === 'facts' ? 'uppercase' : 'none',
    textShadow: boxed ? undefined : `0 ${3 * u}px ${14 * u}px rgba(0,0,0,0.85), 0 0 ${3 * u}px rgba(0,0,0,0.9)`
  }
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: (portrait ? 330 : 78) * u, display: 'flex', justifyContent: 'center' }}>
      <div style={style}>
        {hit.chunk.words.map((w, i) => (
          <span key={i} style={{ color: i === hit.word ? lit : undefined, whiteSpace: 'pre' }}>
            {w.text}
            {i < hit.chunk.words.length - 1 ? ' ' : ''}
          </span>
        ))}
      </div>
    </div>
  )
}

function Progress({ input, f, logoRoom }: { input: ExplainerInput; f: Frame; logoRoom: number }) {
  const frame = useCurrentFrame()
  const p = input.look.palette
  const { u, portrait } = f
  const total = input.totalFrames
  if (input.templateId === 'tutorial') {
    const top = (portrait ? 120 : 50) * u
    const width = f.right - f.left - logoRoom
    const gap = 10 * u
    return (
      <div style={{ position: 'absolute', left: f.left, top, width, height: 7 * u, display: 'flex', gap }}>
        {input.scenes.map((s) => {
          const fill = Math.min(1, Math.max(0, (frame - s.from) / s.frames))
          return (
            <div key={s.id} style={{ flex: `${s.frames} 0 0`, minWidth: 0, height: '100%', borderRadius: 4 * u, background: alpha(p.ink, 0.14), overflow: 'hidden' }}>
              <div style={{ width: `${fill * 100}%`, height: '100%', background: p.accent }} />
            </div>
          )
        })}
      </div>
    )
  }
  const share = Math.min(1, frame / Math.max(1, total - 1))
  if (input.templateId === 'tips')
    return (
      <div style={{ position: 'absolute', left: 0, bottom: 0, width: '100%', height: 16 * u, background: alpha(p.ink, 0.15), borderTop: `${4 * u}px solid ${p.ink}` }}>
        <div style={{ width: `${share * 100}%`, height: '100%', background: p.accent }} />
      </div>
    )
  if (input.templateId === 'facts')
    return <div style={{ position: 'absolute', left: 0, bottom: 0, width: `${share * 100}%`, height: 7 * u, background: p.accent }} />
  return <div style={{ position: 'absolute', left: 0, top: 0, width: `${share * 100}%`, height: 4 * u, background: alpha(p.accent, 0.8) }} />
}

// ---------- audio ----------

/** Background music, turned down while a voice speaks and faded out at the end. */
function Music({ input }: { input: ExplainerInput }) {
  const m = input.music
  if (!m) return null
  const voice = input.scenes.filter((s) => s.audio).map((s) => [s.from + s.audio!.startFrame, s.from + s.audio!.startFrame + s.audio!.frames] as const)
  const ramp = 8
  const volume = (f: number): number => {
    let duck = 1
    if (m.duck) {
      for (const [a, b] of voice) {
        const inside = interpolate(f, [a - ramp, a, b, b + ramp], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
        duck = Math.min(duck, 1 - 0.65 * inside)
      }
    }
    const fade = interpolate(f, [input.totalFrames - 2 * input.fps, input.totalFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    return m.volume * duck * fade
  }
  return <Html5Audio src={m.src} loop volume={volume} trimBefore={m.trimBeforeFrames || undefined} />
}

// ---------- the video ----------

export function ExplainerVideo(input: ExplainerInput) {
  const f = frameOf(input)
  const p = input.look.palette
  const { u } = f
  useFonts(input.fontBase, lookFonts(input.look))
  const counts: Record<string, number> = {}
  const totals: Record<string, number> = {}
  for (const s of input.scenes) totals[s.scene.type] = (totals[s.scene.type] ?? 0) + 1
  const logoH = 64 * u
  const lastType = input.scenes.at(-1)?.scene.type
  return (
    <AbsoluteFill className="sm-x" style={{ background: p.bg, overflow: 'hidden', color: p.ink }}>
      <style>{RESET}</style>
      <Backdrop input={input} f={f} />
      {input.scenes.map((item) => {
        counts[item.scene.type] = (counts[item.scene.type] ?? 0) + 1
        const Scene = SCENES[item.scene.type] ?? StepScene
        const nth = { n: counts[item.scene.type], total: totals[item.scene.type] }
        return (
          <Sequence key={item.id} from={item.from} durationInFrames={item.frames} premountFor={input.fps} name={`${item.scene.type} ${nth.n}`}>
            <SceneShell input={input} item={item}>
              <Scene item={item} input={input} f={f} nth={nth} />
            </SceneShell>
            {item.audio && (
              <Sequence from={item.audio.startFrame} durationInFrames={item.audio.frames} premountFor={input.fps}>
                <Html5Audio src={item.audio.src} volume={item.audio.volume} />
              </Sequence>
            )}
          </Sequence>
        )
      })}
      <Cuts input={input} />
      <Progress input={input} f={f} logoRoom={input.logo ? 260 * u : 0} />
      {input.logo && (
        <LogoCorner src={input.logo} f={f} height={logoH} hideFrom={lastType === 'outro' ? input.scenes.at(-1)!.from : input.totalFrames} />
      )}
      <Captions input={input} f={f} />
      <Music input={input} />
    </AbsoluteFill>
  )
}

function LogoCorner({ src, f, height, hideFrom }: { src: string; f: Frame; height: number; hideFrom: number }) {
  const frame = useCurrentFrame()
  // The outro shows the logo large, so the corner one steps aside.
  const o = interpolate(frame, [hideFrom - 8, hideFrom], [0.92, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const top = (f.portrait ? 96 : 30) * f.u
  return <Img src={src} style={{ position: 'absolute', right: f.width - f.right, top, height, maxWidth: 240 * f.u, objectFit: 'contain', opacity: o }} />
}
