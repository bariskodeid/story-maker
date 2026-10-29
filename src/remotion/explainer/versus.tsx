import type { CSSProperties, ReactNode } from 'react'
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import type { ExplainerInput, ExplainerLook, SceneSide } from '@shared/explainer'
import { alpha, BODY_FONT, BOUNCY, enter, fitSize, MONO_FONT, mix, numberStyle, onColor, type Frame } from './layout'
import { FitBox, Rise, Words } from './parts'
import type { SceneProps } from './scenes'

/**
 * "Perbandingan (A vs B)": a fight-card look. Option A owns the accent color and the left (or top) half,
 * option B the second accent and the right (or bottom) half. Rounds end with the winner's half lighting up and
 * the score in the VS disc ticking over.
 */

export interface Sides {
  a: string
  b: string
}

/** Names of A and B come from the title scene, so renaming them there renames them in every scene. */
export function sideNames(input: ExplainerInput): Sides {
  const named = (s: { scene: { leftTitle: string; rightTitle: string } }): boolean => !!(s.scene.leftTitle || s.scene.rightTitle)
  const src = (input.scenes.find((s) => s.scene.type === 'title' && named(s)) ?? input.scenes.find(named))?.scene
  return { a: src?.leftTitle || 'A', b: src?.rightTitle || 'B' }
}

/** Rounds won by each option in the versus scenes up to scene index `upto` (inclusive). */
export function tally(input: ExplainerInput, upto = input.scenes.length - 1): { a: number; b: number; rounds: number } {
  let a = 0
  let b = 0
  let rounds = 0
  input.scenes.slice(0, upto + 1).forEach((s) => {
    if (s.scene.type !== 'versus') return
    rounds++
    if (s.scene.side === 'left' || s.scene.side === 'both') a++
    if (s.scene.side === 'right' || s.scene.side === 'both') b++
  })
  return { a, b, rounds }
}

/** The frame in a round where the winner is revealed: after the narration had time to weigh both sides. */
export function verdictFrame(frames: number): number {
  return Math.max(30, Math.min(frames - 24, Math.round(frames * 0.55)))
}

const colors = (look: ExplainerLook): { A: string; B: string } => ({ A: look.palette.accent, B: look.palette.accent2 })

/** Option name in the condensed poster face. */
const nameStyle = (look: ExplainerLook, size: number, color: string): CSSProperties => ({
  ...numberStyle(look, size),
  color,
  textTransform: 'uppercase',
  lineHeight: 0.92,
  letterSpacing: '0.01em'
})

/** The largest size (before the font's own scale) at which the longest word of `text` still fits `width`. */
function fitWidth(text: string, size: number, width: number, look: ExplainerLook): number {
  const longest = Math.max(2, ...text.split(/\s+/).map((w) => w.length))
  // Condensed capitals average about half an em per letter.
  return Math.min(size, width / (longest * 0.54 * look.number.scale))
}

/**
 * Two full-bleed halves with a slanted seam. Landscape splits left/right at the middle; portrait splits
 * top/bottom at `splitY`. `grow` (0–1) slides the halves in from their own sides.
 */
function Halves({ f, a, b, splitY, grow }: { f: Frame; a: string; b: string; splitY: number; grow: number }) {
  const { width: W, height: H, portrait } = f
  const off = 1 - grow
  if (!portrait) {
    const d = H * 0.06
    return (
      <>
        <div style={{ position: 'absolute', inset: 0, background: a, clipPath: `polygon(0 0, ${W / 2 + d}px 0, ${W / 2 - d}px ${H}px, 0 ${H}px)`, transform: `translateX(${-off * W * 0.6}px)` }} />
        <div style={{ position: 'absolute', inset: 0, background: b, clipPath: `polygon(${W / 2 + d}px 0, ${W}px 0, ${W}px ${H}px, ${W / 2 - d}px ${H}px)`, transform: `translateX(${off * W * 0.6}px)` }} />
      </>
    )
  }
  const d = W * 0.05
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, background: a, clipPath: `polygon(0 0, ${W}px 0, ${W}px ${splitY - d}px, 0 ${splitY + d}px)`, transform: `translateY(${-off * H * 0.5}px)` }} />
      <div style={{ position: 'absolute', inset: 0, background: b, clipPath: `polygon(0 ${splitY + d}px, ${W}px ${splitY - d}px, ${W}px ${H}px, 0 ${H}px)`, transform: `translateY(${off * H * 0.5}px)` }} />
    </>
  )
}

/** The VS disc on the seam. After a round's verdict it flips to the running score. */
function Disc({ x, y, u, look, text, pop, flip = 1 }: { x: number; y: number; u: number; look: ExplainerLook; text: ReactNode; pop: number; flip?: number }) {
  const p = look.palette
  const size = 150 * u
  return (
    <div
      style={{
        position: 'absolute',
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        borderRadius: '50%',
        background: p.dark ? '#0A0A10' : p.ink,
        border: `${6 * u}px solid ${p.dark ? p.ink : p.bg}`,
        boxShadow: `0 ${14 * u}px ${40 * u}px ${alpha('#000000', 0.35)}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transform: `scale(${pop}) rotate(${(1 - pop) * -40}deg) scaleX(${flip})`
      }}
    >
      <span style={{ ...numberStyle(look, 64 * u), color: p.dark ? p.ink : p.bg, whiteSpace: 'nowrap' }}>{text}</span>
    </div>
  )
}

/** Small capsule above a heading: a round number and the aspect being compared. */
function RoundTag({ n, label, look, u }: { n: number | null; label: string; look: ExplainerLook; u: number }) {
  const p = look.palette
  if (!label && n == null) return null
  return (
    <div style={{ display: 'inline-flex', alignItems: 'stretch', borderRadius: 999, overflow: 'hidden', fontFamily: BODY_FONT, fontWeight: 800, fontSize: 26 * u, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
      {n != null && <span style={{ padding: `${10 * u}px ${18 * u}px`, background: p.ink, color: p.bg, fontFamily: MONO_FONT }}>{String(n).padStart(2, '0')}</span>}
      {label && <span style={{ padding: `${10 * u}px ${22 * u}px`, background: alpha(p.ink, 0.12), color: p.ink }}>{label}</span>}
    </div>
  )
}

// ---------- title ----------

export function VersusTitleScene({ item, input, f }: SceneProps) {
  const s = item.scene
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const { u, portrait } = f
  const look = input.look
  const p = look.palette
  const { A, B } = colors(look)
  const names = sideNames(input)
  const grow = enter(frame, fps, 0, { damping: 18, stiffness: 120 })
  const pop = enter(frame, fps, 10, BOUNCY)
  const ch = f.contentHeight
  const card: CSSProperties = { background: p.dark ? p.bg : p.surface, color: p.ink, borderRadius: 22 * u, boxShadow: `0 ${18 * u}px ${50 * u}px ${alpha('#000000', 0.28)}` }
  const head = (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 * u, padding: `${24 * u}px ${40 * u}px`, maxWidth: portrait ? f.contentWidth : f.contentWidth * 0.78, textAlign: 'center' }}>
      {s.label && <RoundTag n={null} label={s.label} look={look} u={u} />}
      <Words text={s.heading} delay={14} style={{ ...numberStyle(look, fitSize(s.heading, portrait ? 74 : 70, 30) * u), textTransform: 'uppercase', lineHeight: 1.0, color: p.ink }} />
    </div>
  )
  const nameBlock = (name: string, color: string, delay: number, w: number) => (
    <Rise delay={delay} distance={40 * u}>
      <div style={{ ...nameStyle(look, fitWidth(name, (portrait ? 190 : 200) * u, w, look), onColor(color)), textAlign: 'center', maxWidth: w }}>{name}</div>
    </Rise>
  )
  if (!portrait) {
    const headH = ch * 0.34
    const bodyH = s.body ? ch * 0.16 : 0
    const namesY = f.top + headH
    const namesH = ch - headH - bodyH
    const cellW = f.contentWidth / 2 - 110 * u
    return (
      <>
        <Halves f={f} a={A} b={B} splitY={0} grow={grow} />
        <FitBox x={f.left} y={namesY} w={cellW} h={namesH} style={{ alignItems: 'center', justifyContent: 'center' }}>
          {nameBlock(names.a, A, 8, cellW)}
        </FitBox>
        <FitBox x={f.right - cellW} y={namesY} w={cellW} h={namesH} style={{ alignItems: 'center', justifyContent: 'center' }}>
          {nameBlock(names.b, B, 10, cellW)}
        </FitBox>
        <Disc x={f.width / 2} y={namesY + namesH / 2} u={u} look={look} text="VS" pop={pop} />
        <FitBox x={f.left} y={f.top} w={f.contentWidth} h={headH - 20 * u} style={{ alignItems: 'flex-start', justifyContent: 'center' }}>
          <Rise delay={4}>{head}</Rise>
        </FitBox>
        {s.body && (
          <FitBox x={f.left} y={f.bottom - bodyH} w={f.contentWidth} h={bodyH} style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
            <Rise delay={20}>
              <div style={{ ...card, padding: `${12 * u}px ${30 * u}px`, borderRadius: 999, fontFamily: BODY_FONT, fontWeight: 600, fontSize: 32 * u }}>{s.body}</div>
            </Rise>
          </FitBox>
        )}
      </>
    )
  }
  const headH = ch * 0.26
  const bodyH = s.body ? ch * 0.11 : 0
  const zoneTop = f.top + headH
  const zoneH = ch - headH - bodyH
  const splitY = zoneTop + zoneH / 2
  const cellH = zoneH / 2 - 90 * u
  return (
    <>
      <Halves f={f} a={A} b={B} splitY={splitY} grow={grow} />
      <FitBox x={f.left} y={zoneTop} w={f.contentWidth} h={cellH} style={{ alignItems: 'center', justifyContent: 'center' }}>
        {nameBlock(names.a, A, 8, f.contentWidth)}
      </FitBox>
      <FitBox x={f.left} y={splitY + 90 * u} w={f.contentWidth} h={cellH} style={{ alignItems: 'center', justifyContent: 'center' }}>
        {nameBlock(names.b, B, 10, f.contentWidth)}
      </FitBox>
      <Disc x={f.width / 2} y={splitY} u={u} look={look} text="VS" pop={pop} />
      <FitBox x={f.left} y={f.top} w={f.contentWidth} h={headH - 24 * u} style={{ alignItems: 'flex-start', justifyContent: 'center' }}>
        <Rise delay={4}>{head}</Rise>
      </FitBox>
      {s.body && (
        <FitBox x={f.left} y={f.bottom - bodyH} w={f.contentWidth} h={bodyH} style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
          <Rise delay={20}>
            <div style={{ ...card, padding: `${12 * u}px ${28 * u}px`, borderRadius: 999, fontFamily: BODY_FONT, fontWeight: 600, fontSize: 32 * u, textAlign: 'center' }}>{s.body}</div>
          </Rise>
        </FitBox>
      )}
    </>
  )
}

// ---------- one round ----------

function SideCell({
  name,
  value,
  items,
  color,
  look,
  u,
  delay,
  won,
  lost,
  reveal,
  align,
  width
}: {
  name: string
  value: string
  items: string[]
  color: string
  look: ExplainerLook
  u: number
  delay: number
  won: boolean
  lost: boolean
  reveal: number
  align: 'center' | 'flex-start'
  width: number
}) {
  const p = look.palette
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: align,
        textAlign: align === 'center' ? 'center' : 'left',
        gap: 18 * u,
        opacity: 1 - 0.45 * (lost ? reveal : 0)
      }}
    >
      <Rise delay={delay} distance={24 * u}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 14 * u, fontFamily: BODY_FONT, fontWeight: 800, fontSize: 30 * u, letterSpacing: '0.12em', textTransform: 'uppercase', color: p.ink }}>
          <span style={{ width: 22 * u, height: 22 * u, borderRadius: 6 * u, background: color }} />
          {name}
          {won && (
            <span
              style={{
                marginLeft: 6 * u,
                width: 46 * u,
                height: 46 * u,
                borderRadius: '50%',
                background: color,
                color: onColor(color),
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 30 * u,
                transform: `scale(${reveal}) rotate(${(1 - reveal) * -90}deg)`
              }}
            >
              ✓
            </span>
          )}
        </span>
      </Rise>
      {value && (
        <Rise delay={delay + 4} distance={30 * u}>
          <div style={{ ...nameStyle(look, Math.min(170 * u, width / (Math.max(3, value.length) * 0.54 * look.number.scale)), color), whiteSpace: 'nowrap', textShadow: won ? `0 0 ${40 * u * reveal}px ${alpha(color, 0.55)}` : undefined }}>{value}</div>
        </Rise>
      )}
      {items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 * u, alignItems: align }}>
          {items.map((t, i) => (
            <Rise key={i} delay={delay + 10 + i * 5}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 * u, fontFamily: BODY_FONT, fontWeight: 600, fontSize: 38 * u, lineHeight: 1.3, color: p.ink }}>
                <span style={{ flexShrink: 0, width: 12 * u, height: 12 * u, borderRadius: 3 * u, background: color, transform: `translateY(${-6 * u}px)` }} />
                <span>{t}</span>
              </div>
            </Rise>
          ))}
        </div>
      )}
    </div>
  )
}

export function VersusScene({ item, input, f }: SceneProps) {
  const s = item.scene
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const { u, portrait } = f
  const look = input.look
  const p = look.palette
  const { A, B } = colors(look)
  const names = sideNames(input)
  const index = input.scenes.findIndex((x) => x.id === item.id)
  const round = tally(input, index).rounds
  const before = tally(input, index - 1)
  const after = tally(input, index)
  const at = verdictFrame(item.frames)
  const reveal = enter(frame, fps, at, BOUNCY)
  const decided = s.side === 'left' || s.side === 'right' || s.side === 'both'
  const r = decided ? reveal : 0
  const tint = (c: string, won: boolean): string => mix(p.bg, c, (p.dark ? 0.16 : 0.13) + (won ? 0.16 * r : 0))
  const aWon = s.side === 'left' || s.side === 'both'
  const bWon = s.side === 'right' || s.side === 'both'
  const grow = enter(frame, fps, 0, { damping: 20, stiffness: 140 })
  const pop = enter(frame, fps, 6, BOUNCY)
  // The disc flips from "VS" to the new score when the winner is revealed.
  const flipT = interpolate(frame, [at - 4, at + 4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const flip = Math.abs(Math.cos(flipT * Math.PI))
  const discText = decided && flipT >= 0.5 ? `${after.a}:${after.b}` : before.rounds ? `${before.a}:${before.b}` : 'VS'
  const ch = f.contentHeight
  const header = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 * u, textAlign: 'center' }}>
      <Rise delay={2}>
        <RoundTag n={round} label={s.label} look={look} u={u} />
      </Rise>
      <Words text={s.heading} delay={6} style={{ ...numberStyle(look, fitSize(s.heading, portrait ? 76 : 72, 28) * u), textTransform: 'uppercase', lineHeight: 1.0, color: p.ink }} />
    </div>
  )
  const cell = (side: 'a' | 'b', width: number) => (
    <SideCell
      name={side === 'a' ? names.a : names.b}
      value={side === 'a' ? s.leftValue : s.rightValue}
      items={side === 'a' ? s.left : s.right}
      color={side === 'a' ? A : B}
      look={look}
      u={u}
      delay={side === 'a' ? 8 : 12}
      won={side === 'a' ? aWon : bWon}
      lost={decided && s.side !== 'both' && (side === 'a' ? !aWon : !bWon)}
      reveal={r}
      align={portrait ? 'flex-start' : 'center'}
      width={width}
    />
  )
  if (!portrait) {
    const headH = ch * 0.3
    const cellsY = f.top + headH
    const cellsH = ch - headH
    const cellW = f.contentWidth / 2 - 120 * u
    return (
      <>
        <Halves f={f} a={tint(A, aWon)} b={tint(B, bWon)} splitY={0} grow={grow} />
        <FitBox x={f.left} y={f.top} w={f.contentWidth} h={headH - 16 * u} style={{ alignItems: 'center', justifyContent: 'center' }}>
          {header}
        </FitBox>
        <FitBox x={f.left} y={cellsY} w={cellW} h={cellsH} style={{ alignItems: 'center', justifyContent: 'center' }}>
          {cell('a', cellW)}
        </FitBox>
        <FitBox x={f.right - cellW} y={cellsY} w={cellW} h={cellsH} style={{ alignItems: 'center', justifyContent: 'center' }}>
          {cell('b', cellW)}
        </FitBox>
        <Disc x={f.width / 2} y={cellsY + cellsH / 2} u={u} look={look} text={discText} pop={pop} flip={flip} />
      </>
    )
  }
  const headH = ch * 0.24
  const zoneTop = f.top + headH
  const zoneH = ch - headH
  const splitY = zoneTop + zoneH / 2
  const cellH = zoneH / 2 - 95 * u
  return (
    <>
      <Halves f={f} a={tint(A, aWon)} b={tint(B, bWon)} splitY={splitY} grow={grow} />
      <FitBox x={f.left} y={f.top} w={f.contentWidth} h={headH - 16 * u} style={{ alignItems: 'center', justifyContent: 'center' }}>
        {header}
      </FitBox>
      <FitBox x={f.left} y={zoneTop + 10 * u} w={f.contentWidth} h={cellH} style={{ alignItems: 'center' }}>
        {cell('a', f.contentWidth)}
      </FitBox>
      <FitBox x={f.left} y={splitY + 85 * u} w={f.contentWidth} h={cellH} style={{ alignItems: 'center' }}>
        {cell('b', f.contentWidth)}
      </FitBox>
      <Disc x={f.width / 2} y={splitY} u={u} look={look} text={discText} pop={pop} flip={flip} />
    </>
  )
}

// ---------- pros and cons of one option ----------

function Glyph({ plus, color, look, u }: { plus: boolean; color: string; look: ExplainerLook; u: number }) {
  const p = look.palette
  const size = 52 * u
  return (
    <span
      style={{
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: plus ? color : 'transparent',
        border: plus ? undefined : `${4 * u}px solid ${alpha(p.ink, 0.45)}`,
        color: plus ? onColor(color) : alpha(p.ink, 0.7),
        fontFamily: BODY_FONT,
        fontWeight: 800,
        fontSize: 38 * u,
        lineHeight: 1
      }}
    >
      {plus ? '+' : '−'}
    </span>
  )
}

export function ProsConsScene({ item, input, f }: SceneProps) {
  const s = item.scene
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const { u, portrait } = f
  const look = input.look
  const p = look.palette
  const { A, B } = colors(look)
  const names = sideNames(input)
  const right = s.side === 'right'
  const color = right ? B : A
  const name = right ? names.b : names.a
  const ink = onColor(color)
  const grow = enter(frame, fps, 0, { damping: 20, stiffness: 120 })
  const group = (plus: boolean, items: string[], delay: number) =>
    items.length > 0 && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 * u, padding: `${26 * u}px ${30 * u}px`, borderRadius: 24 * u, background: p.surface, border: `${2 * u}px solid ${alpha(p.ink, plus ? 0 : 0.12)}`, boxShadow: plus ? `0 ${16 * u}px ${40 * u}px ${alpha('#000000', p.dark ? 0.35 : 0.1)}` : undefined }}>
        {items.map((t, i) => (
          <Rise key={i} delay={delay + i * 5}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 * u }}>
              <Glyph plus={plus} color={color} look={look} u={u} />
              <span style={{ fontFamily: BODY_FONT, fontWeight: 600, fontSize: 42 * u, lineHeight: 1.28, color: plus ? p.ink : alpha(p.ink, 0.82) }}>{t}</span>
            </div>
          </Rise>
        ))}
      </div>
    )
  const panelText = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 * u, color: ink }}>
      <Rise delay={4}>
        <div style={{ ...nameStyle(look, fitWidth(name, (portrait ? 170 : 180) * u, portrait ? f.contentWidth : f.width * 0.36 - f.left - 60 * u, look), ink) }}>{name}</div>
      </Rise>
      {s.heading && (
        <Words text={s.heading} delay={10} style={{ fontFamily: BODY_FONT, fontWeight: 700, fontSize: fitSize(s.heading, 48, 34) * u, lineHeight: 1.25, color: ink }} />
      )}
    </div>
  )
  const lists = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26 * u, width: '100%' }}>
      {group(true, s.left, 12)}
      {group(false, s.right, 22)}
    </div>
  )
  if (!portrait) {
    const W = f.width
    const H = f.height
    const edge = W * 0.36
    const d = H * 0.05
    const panelW = edge - f.left - 60 * u
    return (
      <>
        <div style={{ position: 'absolute', inset: 0, background: color, clipPath: `polygon(0 0, ${edge + d}px 0, ${edge - d}px ${H}px, 0 ${H}px)`, transform: `translateX(${-(1 - grow) * edge}px)` }} />
        <FitBox x={f.left} y={f.top} w={panelW} h={f.contentHeight} style={{ alignItems: 'center' }}>
          {panelText}
        </FitBox>
        <FitBox x={edge + 80 * u} y={f.top} w={f.right - edge - 80 * u} h={f.contentHeight} style={{ alignItems: 'center' }}>
          {lists}
        </FitBox>
      </>
    )
  }
  const ch = f.contentHeight
  const panelH = ch * 0.3
  const edgeY = f.top + panelH + 30 * u
  const d = f.width * 0.04
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, background: color, clipPath: `polygon(0 0, ${f.width}px 0, ${f.width}px ${edgeY - d}px, 0 ${edgeY + d}px)`, transform: `translateY(${-(1 - grow) * edgeY}px)` }} />
      <FitBox x={f.left} y={f.top} w={f.contentWidth} h={panelH - 20 * u} style={{ alignItems: 'flex-end' }}>
        {panelText}
      </FitBox>
      <FitBox x={f.left} y={edgeY + d + 40 * u} w={f.contentWidth} h={f.bottom - (edgeY + d + 40 * u)} style={{ alignItems: 'center' }}>
        {lists}
      </FitBox>
    </>
  )
}

// ---------- verdict ----------

export function VerdictScene({ item, input, f }: SceneProps) {
  const s = item.scene
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const { u, portrait } = f
  const look = input.look
  const p = look.palette
  const { A, B } = colors(look)
  const names = sideNames(input)
  const total = tally(input)
  const winner: SceneSide = s.side === 'left' || s.side === 'right' ? s.side : 'both'
  const color = winner === 'right' ? B : A
  const grow = enter(frame, fps, 0, { damping: 22, stiffness: 110 })
  const stamp = enter(frame, fps, 16, { damping: 9, stiffness: 160, mass: 0.8 })
  const tie = winner === 'both'
  // A draw gets a dark panel with both names in their own colors, so neither side looks like the winner.
  const tieBg = p.dark ? '#07070C' : p.ink
  const winnerName = winner === 'right' ? names.b : names.a
  const panelInk = tie ? '#FFFFFF' : onColor(color)
  const panel = (w: number) => (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 * u, textAlign: 'center' }}>
      {s.label && (
        <div
          style={{
            padding: `${10 * u}px ${26 * u}px`,
            border: `${6 * u}px solid ${panelInk}`,
            borderRadius: 12 * u,
            fontFamily: BODY_FONT,
            fontWeight: 800,
            fontSize: 34 * u,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: panelInk,
            opacity: Math.min(1, stamp * 1.5),
            transform: `rotate(-6deg) scale(${2.2 - 1.2 * stamp})`
          }}
        >
          {s.label}
        </div>
      )}
      <Rise delay={6} distance={40 * u}>
        {tie ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 * u }}>
            <div style={{ ...nameStyle(look, fitWidth(names.a, (portrait ? 130 : 140) * u, w, look), A), textAlign: 'center' }}>{names.a}</div>
            <div style={{ ...nameStyle(look, 70 * u, '#FFFFFF') }}>=</div>
            <div style={{ ...nameStyle(look, fitWidth(names.b, (portrait ? 130 : 140) * u, w, look), B), textAlign: 'center' }}>{names.b}</div>
          </div>
        ) : (
          <div style={{ ...nameStyle(look, fitWidth(winnerName, (portrait ? 180 : 190) * u, w, look), panelInk), textAlign: 'center', maxWidth: w }}>{winnerName}</div>
        )}
      </Rise>
      {total.rounds > 0 && (
        <Rise delay={12}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 * u, padding: `${10 * u}px ${24 * u}px`, borderRadius: 999, background: p.dark ? '#0A0A10' : p.ink }}>
            <span style={{ width: 20 * u, height: 20 * u, borderRadius: 5 * u, background: A }} />
            <span style={{ ...numberStyle(look, 56 * u), color: p.dark ? p.ink : p.bg, whiteSpace: 'nowrap' }}>
              {total.a} : {total.b}
            </span>
            <span style={{ width: 20 * u, height: 20 * u, borderRadius: 5 * u, background: B }} />
          </div>
        </Rise>
      )}
    </div>
  )
  const choose = (name: string, items: string[], c: string, delay: number) =>
    items.length > 0 && (
      <Rise delay={delay} style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 * u, padding: `${20 * u}px ${24 * u}px`, borderRadius: 20 * u, background: p.surface, borderLeft: `${10 * u}px solid ${c}` }}>
          <span style={{ ...nameStyle(look, 44 * u, c) }}>{name}</span>
          {items.map((t, i) => (
            <span key={i} style={{ fontFamily: BODY_FONT, fontWeight: 600, fontSize: 33 * u, lineHeight: 1.3, color: p.ink }}>
              {t}
            </span>
          ))}
        </div>
      </Rise>
    )
  const text = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 * u, width: '100%' }}>
      <Words text={s.heading} delay={10} style={{ ...numberStyle(look, fitSize(s.heading, portrait ? 80 : 76, 26) * u), textTransform: 'uppercase', lineHeight: 1.0, color: p.ink }} />
      {s.body && (
        <Rise delay={18}>
          <div style={{ fontFamily: BODY_FONT, fontWeight: 500, fontSize: 36 * u, lineHeight: 1.4, color: p.muted }}>{s.body}</div>
        </Rise>
      )}
      {(s.left.length > 0 || s.right.length > 0) && (
        <div style={{ display: 'flex', flexDirection: portrait ? 'column' : 'row', gap: 20 * u }}>
          {choose(names.a, s.left, A, 24)}
          {choose(names.b, s.right, B, 30)}
        </div>
      )}
    </div>
  )
  const fill = (clip: string, transform: string, bg: string) => <div style={{ position: 'absolute', inset: 0, background: bg, clipPath: clip, transform }} />
  if (!portrait) {
    const W = f.width
    const H = f.height
    const d = H * 0.05
    const onRight = winner === 'right'
    const edge = W * 0.48
    const clip = onRight ? `polygon(${W - edge + d}px 0, ${W}px 0, ${W}px ${H}px, ${W - edge - d}px ${H}px)` : `polygon(0 0, ${edge + d}px 0, ${edge - d}px ${H}px, 0 ${H}px)`
    const slide = `translateX(${(onRight ? 1 : -1) * (1 - grow) * edge}px)`
    const panelX = onRight ? W - edge + 70 * u : f.left
    const panelW = edge - f.left - 70 * u
    const textX = onRight ? f.left : edge + 80 * u
    const textW = onRight ? W - edge - f.left - 80 * u : f.right - edge - 80 * u
    return (
      <>
        {tie ? (
          <>
            {fill(`polygon(0 0, ${edge + d}px 0, ${edge - d}px ${H}px, 0 ${H}px)`, slide, tieBg)}
            {fill(`polygon(${edge + d - 26 * u}px 0, ${edge + d}px 0, ${edge}px ${H / 2}px, ${edge - 26 * u}px ${H / 2}px)`, slide, A)}
            {fill(`polygon(${edge - 26 * u}px ${H / 2}px, ${edge}px ${H / 2}px, ${edge - d}px ${H}px, ${edge - d - 26 * u}px ${H}px)`, slide, B)}
          </>
        ) : (
          fill(clip, slide, color)
        )}
        <FitBox x={panelX} y={f.top} w={panelW} h={f.contentHeight} style={{ alignItems: 'center', justifyContent: 'center' }}>
          {panel(panelW)}
        </FitBox>
        <FitBox x={textX} y={f.top} w={textW} h={f.contentHeight} style={{ alignItems: 'center' }}>
          {text}
        </FitBox>
      </>
    )
  }
  const ch = f.contentHeight
  const panelH = ch * 0.42
  const edgeY = f.top + panelH + 20 * u
  const d = f.width * 0.04
  const W = f.width
  const slide = `translateY(${-(1 - grow) * edgeY}px)`
  return (
    <>
      {tie ? (
        <>
          {fill(`polygon(0 0, ${W}px 0, ${W}px ${edgeY - d}px, 0 ${edgeY + d}px)`, slide, tieBg)}
          {fill(`polygon(0 ${edgeY + d - 22 * u}px, ${W / 2}px ${edgeY - 22 * u}px, ${W / 2}px ${edgeY}px, 0 ${edgeY + d}px)`, slide, A)}
          {fill(`polygon(${W / 2}px ${edgeY - 22 * u}px, ${W}px ${edgeY - d - 22 * u}px, ${W}px ${edgeY - d}px, ${W / 2}px ${edgeY}px)`, slide, B)}
        </>
      ) : (
        fill(`polygon(0 0, ${W}px 0, ${W}px ${edgeY - d}px, 0 ${edgeY + d}px)`, slide, color)
      )}
      <FitBox x={f.left} y={f.top} w={f.contentWidth} h={panelH - 10 * u} style={{ alignItems: 'center', justifyContent: 'center' }}>
        {panel(f.contentWidth)}
      </FitBox>
      <FitBox x={f.left} y={edgeY + d + 36 * u} w={f.contentWidth} h={f.bottom - (edgeY + d + 36 * u)} style={{ alignItems: 'center' }}>
        {text}
      </FitBox>
    </>
  )
}

// ---------- template chrome ----------

/** Soft A and B tints under every scene, so plain scenes (the outro) still read as this template. */
export function VersusBackdrop({ input, f }: { input: ExplainerInput; f: Frame }) {
  const p = input.look.palette
  const { A, B } = colors(input.look)
  const a = p.dark ? 0.1 : 0.08
  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: f.portrait
            ? `linear-gradient(172deg, ${alpha(A, a)} 0%, transparent 46%, transparent 54%, ${alpha(B, a)} 100%)`
            : `linear-gradient(100deg, ${alpha(A, a)} 0%, transparent 44%, transparent 56%, ${alpha(B, a)} 100%)`
        }}
      />
    </AbsoluteFill>
  )
}

/** Round pips at the top: filled with the winner's color once a round is decided. */
export function VersusProgress({ input, f }: { input: ExplainerInput; f: Frame }) {
  const frame = useCurrentFrame()
  const p = input.look.palette
  const { A, B } = colors(input.look)
  const { u, portrait } = f
  const rounds = input.scenes.filter((s) => s.scene.type === 'versus')
  const share = Math.min(1, frame / Math.max(1, input.totalFrames - 1))
  const size = 18 * u
  return (
    <>
      {rounds.length > 0 && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: (portrait ? 118 : 44) * u, display: 'flex', justifyContent: 'center', gap: 14 * u }}>
          {rounds.map((s) => {
            const done = frame >= s.from + verdictFrame(s.frames)
            const current = frame >= s.from && frame < s.from + s.frames
            const c = s.scene.side === 'left' ? A : s.scene.side === 'right' ? B : p.ink
            return (
              <span
                key={s.id}
                style={{
                  width: size,
                  height: size,
                  borderRadius: '50%',
                  background: done ? c : 'transparent',
                  border: `${3 * u}px solid ${done ? c : alpha(p.ink, 0.4)}`,
                  transform: `scale(${current ? 1.3 : 1})`
                }}
              />
            )
          })}
        </div>
      )}
      <div style={{ position: 'absolute', left: 0, bottom: 0, height: 7 * u, width: `${share * 100}%`, background: `linear-gradient(90deg, ${A}, ${B})` }} />
    </>
  )
}

/** Cut: A's color sweeps in from the left and B's from the right, they meet over the cut and pass. */
export function VersusCut({ input, d }: { input: ExplainerInput; d: number }) {
  const { A, B } = colors(input.look)
  const t = interpolate(d, [-7, 0, 7], [0, 1, 0])
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '-10%', height: '120%', width: '75%', left: `${-75 + 65 * t}%`, background: A, transform: 'skewX(-12deg)' }} />
      <div style={{ position: 'absolute', top: '-10%', height: '120%', width: '75%', right: `${-75 + 65 * t}%`, background: B, transform: 'skewX(-12deg)' }} />
    </AbsoluteFill>
  )
}
