import type { CSSProperties, ReactNode } from 'react'
import { AbsoluteFill, Html5Audio, Img, interpolate, random, Sequence, useCurrentFrame, useVideoConfig } from 'remotion'
import { lookFonts, type ExplainerInput, type ExplainerSceneInput, type SceneType } from '@shared/explainer'
import { useFonts } from '../fonts'
import { Captions } from './captions'
import { alpha, distToRect, enter, frameOf, holeMask, overlaps, textZones, type Frame, type Rect } from './layout'
import { HeadlineScene, NewsBackdrop, NewsChrome, NewsCut, NewsTitleScene, PointsScene } from './news'
import { CompareScene, FactScene, OutroScene, QuoteScene, StepScene, TipScene, TitleScene, type SceneProps } from './scenes'
import { ProsConsScene, VerdictScene, VersusBackdrop, VersusCut, VersusProgress, VersusScene, VersusTitleScene } from './versus'

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

/** Logo and progress graphics: decorations keep out of them too. */
function chromeZones(input: ExplainerInput, f: Frame): Rect[] {
  const { u, portrait } = f
  const zones: Rect[] = []
  if (input.logo) zones.push({ x: f.right - 240 * u, y: (portrait ? 96 : 30) * u, w: 240 * u, h: 64 * u })
  if (input.templateId === 'tips') zones.push({ x: 0, y: f.height - 20 * u, w: f.width, h: 20 * u })
  return zones
}

// ---------- background ----------

/**
 * The tips template's playful shapes. Each one is placed and sized from the text zones (content box and
 * caption band), so no dot or ring ever sits between the letters of a heading or a caption.
 */
function TipsDecor({ input, f }: { input: ExplainerInput; f: Frame }) {
  const frame = useCurrentFrame()
  const p = input.look.palette
  const { u, portrait, width: W, height: H } = f
  const text = [...textZones(f), ...chromeZones(input, f).slice(0, input.logo ? 1 : 0)]
  const keep = [...textZones(f), ...chromeZones(input, f)]
  const margin = 26 * u
  const wobble = 22 * u
  // A big disc beyond the bottom-right corner, as large as it can be without reaching any text (it may pass
  // under the progress bar, which is drawn on top of it).
  const bc = { x: W + 40 * u, y: H + 40 * u }
  const br = Math.min(560 * u, ...text.map((z) => distToRect(bc.x, bc.y, z) - margin - wobble))
  // A dashed ring around the top-left corner, sized the same way.
  const rc = { x: -40 * u, y: -40 * u }
  const rr = Math.min(320 * u, ...text.map((z) => distToRect(rc.x, rc.y, z) - margin))
  const pieces: { x: number; y: number; s: number; r: Rect; i: number }[] = []
  for (let i = 0; i < 10; i++) {
    const s = ((portrait ? 12 : 14) + random(`s${i}`) * (portrait ? 12 : 16)) * u
    // A turning square needs √2 of its side; the float adds 10 units above and below.
    const box = s * 1.42
    for (let k = 0; k < 40; k++) {
      const x = random(`x${i}-${k}`) * (W - box)
      const y = 10 * u + random(`y${i}-${k}`) * (H - box - 20 * u)
      const r = { x, y: y - 10 * u, w: box, h: box + 20 * u }
      const nearDisc = br > 0 && Math.hypot(x + box / 2 - bc.x, y + box / 2 - bc.y) < br + wobble + box
      if (nearDisc || keep.some((z) => overlaps(r, z, 16 * u)) || pieces.some((q) => overlaps(r, q.r, 24 * u))) continue
      pieces.push({ x, y, s, r, i })
      break
    }
  }
  const colors = [p.accent, p.ink, p.surface]
  return (
    <>
      {br > 60 * u && (
        <div
          style={{
            position: 'absolute',
            width: br * 2,
            height: br * 2,
            borderRadius: '50%',
            left: bc.x - br,
            top: bc.y - br,
            background: p.accent2,
            opacity: p.dark ? 0.55 : 0.9,
            transform: `translate(${Math.sin(frame / 70) * 20 * u}px, ${Math.cos(frame / 90) * 16 * u}px)`
          }}
        />
      )}
      {rr > 60 * u && (
        <div
          style={{
            position: 'absolute',
            width: rr * 2,
            height: rr * 2,
            borderRadius: '50%',
            left: rc.x - rr,
            top: rc.y - rr,
            border: `${5 * u}px dashed ${alpha(p.ink, 0.35)}`,
            transform: `rotate(${frame * 0.25}deg)`
          }}
        />
      )}
      {pieces.map(({ x, y, s, i }) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: x + (s * 0.42) / 2,
            top: y + (s * 0.42) / 2 + Math.sin(frame / 30 + i) * 10 * u,
            width: s,
            height: s,
            borderRadius: i % 2 ? '50%' : 3 * u,
            background: colors[i % 3],
            opacity: 0.6,
            transform: `rotate(${frame * (i % 2 ? 1 : -1) + i * 30}deg)`
          }}
        />
      ))}
    </>
  )
}

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
        {/* The dot grid fades out under text, so no dot shows between letters. */}
        <div
          style={{
            ...fill,
            backgroundImage: `radial-gradient(${alpha(p.ink, p.dark ? 0.1 : 0.12)} ${1.6 * u}px, transparent ${1.9 * u}px)`,
            backgroundSize: `${44 * u}px ${44 * u}px`,
            ...holeMask(f.width, f.height, textZones(f), 34 * u)
          }}
        />
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
  if (input.templateId === 'tips') return <TipsDecor input={input} f={f} />
  if (input.templateId === 'compare') return <VersusBackdrop input={input} f={f} />
  if (input.templateId === 'news') return <NewsBackdrop input={input} f={f} />
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

const SCENES: Record<SceneType, (p: SceneProps) => ReactNode> = {
  title: TitleScene,
  step: StepScene,
  tip: TipScene,
  fact: FactScene,
  quote: QuoteScene,
  compare: CompareScene,
  outro: OutroScene,
  versus: VersusScene,
  proscons: ProsConsScene,
  verdict: VerdictScene,
  headline: HeadlineScene,
  points: PointsScene
}

/** A scene's layout; the A-vs-B and news templates open with their own title layouts. */
function sceneFor(input: ExplainerInput, type: SceneType): (p: SceneProps) => ReactNode {
  if (type === 'title' && input.templateId === 'compare') return VersusTitleScene
  if (type === 'title' && input.templateId === 'news') return NewsTitleScene
  return SCENES[type] ?? StepScene
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
  else if (input.templateId === 'compare') style = { opacity: Math.min(1, e * 1.8) * (1 - x), transform: `scale(${1.03 - 0.03 * e})` }
  else if (input.templateId === 'news') style = { opacity: Math.min(1, e * 1.6) * (1 - x), transform: `translateX(${(1 - e) * 50 * u - x * 40 * u}px)` }
  else style = { opacity: Math.min(1, e * 1.5) * (1 - x), transform: `translateY(${(1 - e) * 40 * u - x * 34 * u}px)` }
  return <AbsoluteFill style={style}>{children}</AbsoluteFill>
}

/** A colored panel (tips), a flash (facts), a clash of the two colors (compare) or a ticker band (news) over each cut. */
function Cuts({ input }: { input: ExplainerInput }) {
  const frame = useCurrentFrame()
  const p = input.look.palette
  if (input.templateId === 'tutorial' || input.templateId === 'quote') return null
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
    if (input.templateId === 'compare' && d >= -7 && d <= 7) return <VersusCut input={input} d={d} />
    if (input.templateId === 'news' && d >= -8 && d <= 8) return <NewsCut input={input} d={d} next={s.scene.label} />
  }
  return null
}

// ---------- overlays ----------

function Progress({ input, f, logoRoom }: { input: ExplainerInput; f: Frame; logoRoom: number }) {
  const frame = useCurrentFrame()
  const p = input.look.palette
  const { u, portrait } = f
  const total = input.totalFrames
  if (input.templateId === 'compare') return <VersusProgress input={input} f={f} />
  if (input.templateId === 'news') return <NewsChrome input={input} f={f} logoRoom={logoRoom} />
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
        const Scene = sceneFor(input, item.scene.type)
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
