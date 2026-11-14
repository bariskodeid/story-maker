import { Easing, useCurrentFrame } from 'remotion'
import { formatChartValue, type ExplainerInput } from '@shared/explainer'
import { alpha, BODY_FONT, fitSize, headingStyle, mix, MONO_FONT, onColor } from './layout'
import { Kicker } from './news'
import { FitBox, Rise, Words } from './parts'
import type { SceneProps } from './scenes'

/**
 * "Grafik": a bar, line, donut or bubble chart on its own surface card. The science backdrop draws a millimetre grid, which
 * would run through thin strokes and axis labels, so the chart sits on an opaque card and the grid never
 * reaches it. Everything animates from the frame number only, so the Player and the MP4 show the same thing.
 */

type ChartData = NonNullable<SceneProps['item']['scene']['chart']>

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const ease = Easing.out(Easing.cubic)
const progress = (frame: number, from: number, len: number) => ease(clamp01((frame - from) / len))
/** Monospace glyphs are 0.6em wide, which keeps every text-width estimate here honest. */
const textW = (text: string, size: number) => text.length * size * 0.6
/** Counting values change width every frame; fixed-width digits keep them from wobbling. */
const TABULAR = { fontVariantNumeric: 'tabular-nums' } as const

/** Round tick values (1, 2, 5 × 10^k) inside [lo, hi], about four of them. */
function niceTicks(lo: number, hi: number): number[] {
  const span = hi - lo
  if (!(span > 0)) return []
  const raw = span / 4
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(Math.abs(v) < step * 1e-6 ? 0 : v)
  return out
}

interface PanelProps {
  chart: ChartData
  input: ExplainerInput
  u: number
  w: number
  h: number
  /** Frames the scene lasts, to spread the animation over it. */
  frames: number
}

function BarChart({ chart, input, u, w, h, portrait, frames }: PanelProps & { portrait: boolean }) {
  const frame = useCurrentFrame()
  const p = input.look.palette
  const items = chart.items
  const n = items.length
  const fmt = (v: number) => formatChartValue(v, input.language)
  const vertical = !portrait && items.every((it) => it.label.length <= 12)
  const lo = Math.min(0, ...items.map((it) => it.value))
  const hi = Math.max(0, ...items.map((it) => it.value))
  // All-zero data: a unit range keeps the division finite and the bars flat.
  const span = hi - lo || 1
  const hasNeg = lo < 0
  const gap = Math.max(4, Math.min(12, (frames * 0.4) / Math.max(1, n)))
  const grow = (i: number) => progress(frame, 8 + i * gap, 20)
  const axis = alpha(p.ink, 0.55)
  const valueFont = 26 * u
  const posFill = p.accent
  const negFill = p.accent2
  const fillOf = (v: number) => (v < 0 ? negFill : posFill)

  if (vertical) {
    const labelFont = Math.max(16, Math.min(28, w / n / (Math.max(...items.map((it) => it.label.length)) * 0.62))) * u
    const topBand = 46 * u
    const botBand = labelFont * 1.6 + (hasNeg ? 46 * u : 0)
    const plotH = Math.max(1, h - topBand - botBand)
    const y = (v: number) => topBand + ((hi - v) / span) * plotH
    const slot = w / n
    const barW = Math.min(slot * 0.62, 160 * u)
    return (
      <div style={{ position: 'relative', width: w, height: h }}>
        {items.map((it, i) => {
          const g = grow(i)
          const v = it.value * g
          const top = Math.min(y(0), y(v))
          const bh = Math.abs(y(v) - y(0))
          const cx = slot * i + slot / 2
          const shown = fmt(it.value * g)
          return (
            <div key={i}>
              <div style={{ position: 'absolute', left: cx - barW / 2, top, width: barW, height: bh, background: fillOf(it.value), borderRadius: it.value < 0 ? `0 0 ${6 * u}px ${6 * u}px` : `${6 * u}px ${6 * u}px 0 0` }} />
              <div
                style={{
                  position: 'absolute',
                  left: cx - slot / 2,
                  width: slot,
                  textAlign: 'center',
                  top: it.value < 0 ? top + bh + 8 * u : top - valueFont * 1.3 - 6 * u,
                  fontFamily: MONO_FONT,
                  ...TABULAR,
                  fontWeight: 700,
                  fontSize: valueFont,
                  lineHeight: 1.3,
                  color: p.ink,
                  opacity: clamp01(g * 3)
                }}
              >
                {shown}
              </div>
              <div style={{ position: 'absolute', left: cx - slot / 2, width: slot, top: h - botBand + (hasNeg ? 46 * u : 0) + labelFont * 0.3, textAlign: 'center', whiteSpace: 'nowrap', fontFamily: BODY_FONT, fontWeight: 600, fontSize: labelFont, lineHeight: 1.2, color: p.ink }}>{it.label}</div>
            </div>
          )
        })}
        <div style={{ position: 'absolute', left: 0, top: y(0) - 1.5 * u, width: w, height: 3 * u, background: axis }} />
      </div>
    )
  }

  // Horizontal: labels in a column on the left, bars growing to the right of (or, below zero, left of) the axis.
  const rowH = h / n
  const labelFont = Math.max(18, Math.min(30, rowH * 0.42 / u)) * u
  const barH = Math.min(rowH * 0.62, 64 * u)
  const maxLabel = Math.max(...items.map((it) => it.label.length))
  const labW = Math.min(w * 0.34, maxLabel * labelFont * 0.58 + 8 * u)
  const valRoom = Math.max(...items.map((it) => textW(fmt(it.value), valueFont))) + 18 * u
  const x0 = labW + 18 * u + (hasNeg ? valRoom : 0)
  const x1 = w - valRoom
  const x = (v: number) => x0 + ((v - lo) / span) * (x1 - x0)
  return (
    <div style={{ position: 'relative', width: w, height: h }}>
      {items.map((it, i) => {
        const g = grow(i)
        const v = it.value * g
        const left = Math.min(x(0), x(v))
        const bw = Math.abs(x(v) - x(0))
        const text = fmt(it.value * g)
        const tw = textW(text, valueFont)
        const inside = bw > tw + 28 * u
        const cy = rowH * i + rowH / 2
        const fill = fillOf(it.value)
        const neg = it.value < 0
        return (
          <div key={i}>
            <div style={{ position: 'absolute', left: 0, top: cy - labelFont * 0.7, width: labW, fontFamily: BODY_FONT, fontWeight: 600, fontSize: labelFont, lineHeight: 1.4, color: p.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.label}</div>
            <div style={{ position: 'absolute', left, top: cy - barH / 2, width: bw, height: barH, background: fill, borderRadius: neg ? `${6 * u}px 0 0 ${6 * u}px` : `0 ${6 * u}px ${6 * u}px 0` }} />
            <div
              style={{
                position: 'absolute',
                top: cy - valueFont * 0.65,
                left: inside ? (neg ? left + 14 * u : left + bw - tw - 14 * u) : neg ? left - tw - 12 * u : left + bw + 12 * u,
                fontFamily: MONO_FONT,
                ...TABULAR,
                fontWeight: 700,
                fontSize: valueFont,
                lineHeight: 1.3,
                whiteSpace: 'nowrap',
                color: inside ? onColor(fill) : p.ink,
                opacity: clamp01(g * 3)
              }}
            >
              {text}
            </div>
          </div>
        )
      })}
      <div style={{ position: 'absolute', left: x(0) - 1.5 * u, top: 0, width: 3 * u, height: h, background: axis }} />
    </div>
  )
}

function LineChart({ chart, input, u, w, h, frames }: PanelProps) {
  const frame = useCurrentFrame()
  const p = input.look.palette
  const items = chart.items
  const n = items.length
  const fmt = (v: number) => formatChartValue(v, input.language)
  const vals = items.map((it) => it.value)
  const dMin = Math.min(...vals)
  const dMax = Math.max(...vals)
  // A flat series (e.g. all zeros) gets an artificial span, so the line runs through the middle without NaN.
  const pad = dMax === dMin ? 1 : (dMax - dMin) * 0.1
  const lo = dMin - pad
  const hi = dMax + pad
  const ticks = niceTicks(lo, hi)
  const tickFont = 24 * u
  const xFont = 24 * u
  const yLabW = Math.max(...ticks.map((t) => textW(fmt(t), tickFont)), 0) + 18 * u
  const top = 44 * u
  const bottom = h - xFont * 2
  const left = yLabW
  const right = w - 30 * u
  const px = (i: number) => (n === 1 ? (left + right) / 2 : left + (i / (n - 1)) * (right - left))
  const py = (v: number) => top + ((hi - v) / (hi - lo)) * (bottom - top)
  const d = items.map((it, i) => `${i ? 'L' : 'M'}${px(i).toFixed(2)} ${py(it.value).toFixed(2)}`).join(' ')
  const drawLen = Math.min(50, frames * 0.4)
  const prog = progress(frame, 8, drawLen)
  const reach = prog * Math.max(1, n - 1)
  const dotA = (i: number) => clamp01((reach - i + 0.3) / 0.3)
  const slot = n > 1 ? (right - left) / (n - 1) : right - left
  const maxLabel = Math.max(...items.map((it) => it.label.length))
  let step = Math.max(1, Math.ceil((textW('0', xFont) * maxLabel * 1.05 + 14 * u) / slot))
  if (n > 8) step = Math.max(step, Math.ceil(n / 6))
  // Counting back from the last point keeps the final label, which carries the conclusion.
  const labelled = (i: number) => (n - 1 - i) % step === 0
  const last = n - 1
  const lastText = fmt(vals[last])
  const pillW = textW(lastText, 26 * u) + 28 * u
  const pillH = 44 * u
  const lx = px(last)
  const ly = py(vals[last])
  // The pill sits above the point; near the plot's right edge it shifts left so it never leaves the card.
  const pillX = Math.min(lx - pillW / 2, w - pillW - 4 * u)
  const pillY = Math.max(2 * u, ly - 22 * u - pillH)
  const pillA = clamp01((prog - 0.85) / 0.15)
  const lineColor = p.accent
  const mono = { fontFamily: MONO_FONT, style: TABULAR } as const
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', overflow: 'visible' }}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={left} x2={right} y1={py(t)} y2={py(t)} stroke={alpha(p.ink, t === 0 ? 0.5 : 0.16)} strokeWidth={(t === 0 ? 3 : 2) * u} />
          <text x={left - 12 * u} y={py(t) + tickFont * 0.35} textAnchor="end" fontSize={tickFont} fill={p.muted} fontWeight={600} {...mono}>
            {fmt(t)}
          </text>
        </g>
      ))}
      <line x1={left} x2={left} y1={top} y2={bottom} stroke={alpha(p.ink, 0.4)} strokeWidth={2 * u} />
      {items.map((it, i) =>
        labelled(i) ? (
          <text key={i} x={px(i)} y={bottom + xFont * 1.45} textAnchor={i === 0 && n > 1 ? 'start' : i === last && n > 1 ? 'end' : 'middle'} fontSize={xFont} fill={p.ink} fontWeight={600} fontFamily={BODY_FONT}>
            {it.label.length > 14 ? it.label.slice(0, 13) + '…' : it.label}
          </text>
        ) : null
      )}
      {n > 1 && (
        <>
          {/* A wide halo in the card's colour keeps the stroke apart from any gridline it crosses. */}
          <path d={d} fill="none" stroke={p.surface} strokeWidth={13 * u} strokeLinejoin="round" strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - prog} />
          <path d={d} fill="none" stroke={lineColor} strokeWidth={7 * u} strokeLinejoin="round" strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - prog} />
        </>
      )}
      {items.map((it, i) => {
        const isLast = i === last
        const r = (isLast ? 15 : 9) * u * dotA(i)
        return (
          <g key={i}>
            {isLast && <circle cx={px(i)} cy={py(it.value)} r={r * 2} fill={alpha(lineColor, 0.22)} />}
            <circle cx={px(i)} cy={py(it.value)} r={r} fill={isLast ? lineColor : p.surface} stroke={lineColor} strokeWidth={5 * u} />
          </g>
        )
      })}
      <g opacity={pillA}>
        <rect x={pillX} y={pillY} width={pillW} height={pillH} rx={8 * u} fill={p.accent} />
        <text x={pillX + pillW / 2} y={pillY + pillH / 2 + 26 * u * 0.35} textAnchor="middle" fontSize={26 * u} fontWeight={700} fill={onColor(p.accent)} {...mono}>
          {fmt(vals[last] * pillA)}
        </text>
      </g>
    </svg>
  )
}

/**
 * Up to six slice colours that stay apart on light and dark palettes: the two accents, then shades pulled toward
 * ink (dark on light themes, light on dark themes) and tints pulled toward the background, so lightness differs, not only hue.
 */
function seriesColors(p: ExplainerInput['look']['palette']): string[] {
  return [p.accent, p.accent2, mix(p.accent, p.ink, 0.6), mix(p.accent2, p.ink, 0.6), mix(p.accent, p.bg, 0.4), mix(p.accent2, p.bg, 0.4)]
}

function DonutChart({ chart, input, u, w, h, portrait, frames }: PanelProps & { portrait: boolean }) {
  const frame = useCurrentFrame()
  const p = input.look.palette
  const items = chart.items
  const n = items.length
  const colors = seriesColors(p)
  const total = items.reduce((a, it) => a + it.value, 0)
  const gap = Math.max(5, Math.min(14, (frames * 0.4) / Math.max(1, n)))
  const grow = (i: number) => progress(frame, 8 + i * gap, 26)
  const legendGap = 40 * u
  const d = Math.max(1, portrait ? Math.min(w, h * 0.56) : Math.min(h, w * 0.46))
  const sw = d * 0.2
  const r = (d - sw) / 2
  const cx = d / 2
  // The seam between slices is a fixed share of the ring, so every seam looks the same width.
  const seam = Math.min(0.012, 0.25 / Math.max(1, n))
  let acc = 0
  const arcs = items.map((it, i) => {
    const frac = total > 0 ? it.value / total : 0
    const start = acc
    acc += frac
    return { frac, start, i }
  })
  const top = items.reduce((b, it, i) => (it.value > items[b].value ? i : b), 0)
  const topFrac = total > 0 ? items[top].value / total : 0
  const centerFont = d * 0.17
  const legendW = portrait ? w : Math.max(1, w - d - legendGap)
  const legendH = portrait ? Math.max(1, h - d - 24 * u) : h
  const rowH = Math.min(portrait ? 80 * u : 72 * u, legendH / Math.max(1, n))
  const font = Math.max(16 * u, Math.min(40 * u, rowH * 0.5))
  const pct = (v: number) => {
    const rounded = total > 0 ? Math.round((v / total) * 100) : 0
    return v > 0 && rounded === 0 ? '<1%' : `${rounded}%`
  }
  return (
    <div style={{ display: 'flex', flexDirection: portrait ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: portrait ? 24 * u : legendGap, width: w, height: h }}>
      <svg width={d} height={d} viewBox={`0 0 ${d} ${d}`} style={{ display: 'block', flex: 'none' }}>
        {/* Rotated so the first slice opens at 12 o'clock and runs clockwise. */}
        <g transform={`rotate(-90 ${cx} ${cx})`}>
          <circle cx={cx} cy={cx} r={r} fill="none" stroke={alpha(p.ink, total > 0 ? 0.07 : 0.16)} strokeWidth={total > 0 ? sw : sw * 0.35} />
          {arcs.map(({ frac, start, i }) => {
            const seamed = frac > seam * 2
            const len = Math.max(0, frac * grow(i) - (seamed ? seam : 0))
            if (len <= 0) return null
            return <circle key={i} cx={cx} cy={cx} r={r} fill="none" stroke={colors[i % colors.length]} strokeWidth={sw} pathLength={1} strokeDasharray={`${len} 2`} strokeDashoffset={-(start + (seamed ? seam / 2 : 0))} />
          })}
        </g>
        {total > 0 && (
          <>
            <text x={cx} y={cx + centerFont * 0.15} textAnchor="middle" fontSize={centerFont} fontWeight={700} fill={p.ink} fontFamily={MONO_FONT} style={TABULAR}>
              {Math.round(topFrac * 100 * grow(top))}%
            </text>
            <text x={cx} y={cx + centerFont * 0.15 + centerFont * 0.62} textAnchor="middle" fontSize={centerFont * 0.36} fontWeight={600} fill={p.muted} fontFamily={BODY_FONT}>
              {items[top].label.length > 14 ? items[top].label.slice(0, 13) + '…' : items[top].label}
            </text>
          </>
        )}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', width: legendW, minWidth: 0 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16 * u, height: rowH, opacity: clamp01(grow(i) * 3) }}>
            <span style={{ flex: 'none', width: font * 0.8, height: font * 0.8, borderRadius: font * 0.2, background: colors[i % colors.length] }} />
            <span style={{ flex: 1, minWidth: 0, fontFamily: BODY_FONT, fontWeight: 600, fontSize: font, lineHeight: 1.2, color: p.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.label}</span>
            <span style={{ flex: 'none', fontFamily: MONO_FONT, ...TABULAR, fontWeight: 700, fontSize: font, color: p.ink }}>{pct(it.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function BubbleChart({ chart, input, u, w, h, portrait, frames }: PanelProps & { portrait: boolean }) {
  const frame = useCurrentFrame()
  const p = input.look.palette
  const fmt = (v: number) => formatChartValue(v, input.language)
  const colors = seriesColors(p)
  // Small to large, so the growth ends on the biggest one; the original index keeps each item's colour.
  const items = chart.items.map((it, k) => ({ ...it, k })).sort((a, b) => a.value - b.value)
  const n = items.length
  const vMax = Math.max(...items.map((it) => it.value))
  const gap = Math.max(5, Math.min(14, (frames * 0.4) / Math.max(1, n)))
  const grow = (i: number) => progress(frame, 8 + i * gap, 26)
  const labelFont = (portrait ? 28 : 26) * u
  const valueFont = (portrait ? 30 : 28) * u
  const textBlock = labelFont * 1.3 + valueFont * 1.3 + 16 * u
  const rows = portrait && n > 3 ? 2 : 1
  const perRow = Math.ceil(n / rows)
  const rowSets = Array.from({ length: rows }, (_, k) => items.slice(k * perRow, (k + 1) * perRow))
  const rMin = 12 * u
  // Area ∝ value means radius ∝ √value; a floor keeps a 1:10,000 item visible instead of a sub-pixel dot.
  const radiusAt = (v: number, rMax: number) => (vMax > 0 ? Math.max(rMin, rMax * Math.sqrt(v / vMax)) : rMin)
  const shortLabel = (t: string) => (t.length > 12 ? t.slice(0, 11) + '…' : t)
  const slotW = (it: { label: string; value: number }, rMax: number) => Math.max(2 * radiusAt(it.value, rMax), textW(shortLabel(it.label), labelFont) * 0.95 + 12 * u)
  const fits = (rMax: number) => rowSets.every((row) => row.reduce((a, it) => a + slotW(it, rMax), 0) + (row.length - 1) * 12 * u <= w)
  // Widest radius whose rows still fit the card: slot widths grow monotonically, so bisection is enough.
  let lo = rMin
  let hi = Math.max(rMin, (h / rows - textBlock - (rows - 1) * 10 * u) / 2)
  if (fits(hi)) lo = hi
  else
    for (let k = 0; k < 24; k++) {
      const mid = (lo + hi) / 2
      if (fits(mid)) lo = mid
      else hi = mid
    }
  const rMax = lo
  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 20 * u, width: w, height: h }}>
      {rowSets.map((row, ri) => (
        <div key={ri} style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 12 * u }}>
          {row.map((it, ci) => {
            const i = ri * perRow + ci
            const g = grow(i)
            const rad = radiusAt(it.value, rMax)
            return (
              <div key={it.k} style={{ width: slotW(it, rMax), display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ height: 2 * rMax, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                  <div style={{ width: 2 * rad * g, height: 2 * rad * g, borderRadius: '50%', background: colors[it.k % colors.length] }} />
                </div>
                <div style={{ marginTop: 14 * u, fontFamily: BODY_FONT, fontWeight: 600, fontSize: labelFont, lineHeight: 1.3, color: p.ink, whiteSpace: 'nowrap', opacity: clamp01(g * 3) }}>{shortLabel(it.label)}</div>
                <div style={{ fontFamily: MONO_FONT, ...TABULAR, fontWeight: 700, fontSize: valueFont, lineHeight: 1.3, color: p.muted, whiteSpace: 'nowrap', opacity: clamp01(g * 3) }}>{fmt(it.value * g)}</div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

export function ChartScene({ item, input, f }: SceneProps) {
  const s = item.scene
  const { u, portrait } = f
  const look = input.look
  const p = look.palette
  const chart = s.chart
  const ok = !!chart && chart.items.length > 0
  const pad = 30 * u
  const cardW = f.contentWidth
  const cardH = f.contentHeight * (portrait ? 0.7 : 0.6)
  const unitH = chart?.unit ? 36 * u : 0
  const innerW = cardW - pad * 2
  const innerH = cardH - pad * 2 - unitH
  const panel = chart && ok ? { chart, input, u, w: innerW, h: innerH, frames: item.frames } : null

  return (
    <FitBox x={f.left} y={f.top} w={f.contentWidth} h={f.contentHeight} style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', gap: (portrait ? 30 : 26) * u, width: f.contentWidth }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 * u, width: f.contentWidth }}>
          <Kicker text={s.label} look={look} u={u} />
          <Words text={s.heading} delay={2} style={{ ...headingStyle(look, fitSize(s.heading, portrait ? 72 : 64, 30) * u), color: p.ink }} />
        </div>
        {panel && (
          <Rise delay={4} distance={16}>
            <div
              style={{
                width: cardW,
                height: cardH,
                padding: pad,
                background: p.surface,
                border: `${2 * u}px solid ${alpha(p.ink, 0.2)}`,
                borderRadius: 14 * u,
                boxShadow: `0 ${8 * u}px ${24 * u}px ${alpha(mix(p.ink, p.bg, 0.2), p.dark ? 0.4 : 0.12)}`,
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              {unitH > 0 && <div style={{ height: unitH, fontFamily: MONO_FONT, fontWeight: 700, fontSize: 22 * u, letterSpacing: '0.08em', textTransform: 'uppercase', color: p.muted }}>{chart!.unit}</div>}
              {panel.chart.kind === 'line' ? <LineChart {...panel} /> : panel.chart.kind === 'donut' ? <DonutChart {...panel} portrait={portrait} /> : panel.chart.kind === 'bubble' ? <BubbleChart {...panel} portrait={portrait} /> : <BarChart {...panel} portrait={portrait} />}
            </div>
          </Rise>
        )}
        {s.body && (
          <Rise delay={10}>
            <div style={{ fontFamily: BODY_FONT, fontWeight: 500, fontSize: (portrait ? 32 : 28) * u, lineHeight: 1.4, color: p.muted }}>{s.body}</div>
          </Rise>
        )}
      </div>
      {s.author && (
        <Rise delay={14} style={{ paddingTop: 20 * u }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 * u, fontFamily: MONO_FONT, fontSize: 22 * u, letterSpacing: '0.06em', textTransform: 'uppercase', color: p.muted }}>
            <span style={{ width: 12 * u, height: 12 * u, background: p.accent }} />
            {s.author}
          </div>
        </Rise>
      )}
    </FitBox>
  )
}
