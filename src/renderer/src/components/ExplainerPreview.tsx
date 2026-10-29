import { forwardRef, useMemo, type CSSProperties, type ReactNode } from 'react'
import { Player, Thumbnail, type PlayerRef } from '@remotion/player'
import { ChartNoAxesColumn, Check, Lightbulb, ListOrdered, Newspaper, Quote, Swords } from 'lucide-react'
import {
  buildExplainerInput,
  CAPTION_STYLES,
  EXPLAINER_TEMPLATES,
  sampleExplainerInput,
  type CaptionStyleId,
  type ExplainerInput,
  type ExplainerLook,
  type ExplainerTemplateId
} from '@shared/explainer'
import { CaptionLine } from '@video/explainer/captions'
import { ExplainerVideo } from '@video/explainer/ExplainerVideo'
import { CAPTION_METRICS } from '@video/explainer/layout'
import { useProject } from '../store/project'
import { cx } from './ui'

/** Fonts for the preview come through the app's own protocol; the render uses its local asset server instead. */
export const PREVIEW_FONT_BASE = 'studio://fonts/'

/**
 * The open explainer project as composition props, with studio:// file URLs. The export builds the same props
 * with the same function (buildExplainerInput), so the preview shows what the MP4 will be.
 */
export function useExplainerInput(): ExplainerInput | null {
  const project = useProject((s) => s.project)
  const clips = useProject((s) => s.clips)
  const assets = useProject((s) => s.assets)
  return useMemo(
    () =>
      project && project.kind === 'explainer'
        ? buildExplainerInput({
            project,
            clips,
            assets,
            assetBase: `studio://asset/${encodeURIComponent(project.id)}/`,
            fontBase: PREVIEW_FONT_BASE
          })
        : null,
    [project, clips, assets]
  )
}

/** The whole video with play controls. */
export const ExplainerPlayer = forwardRef<PlayerRef, { input: ExplainerInput; style?: CSSProperties; className?: string }>(function ExplainerPlayer(
  { input, style, className },
  ref
) {
  return (
    <Player
      ref={ref}
      component={ExplainerVideo}
      inputProps={input}
      durationInFrames={input.totalFrames}
      fps={input.fps}
      compositionWidth={input.width}
      compositionHeight={input.height}
      controls
      showVolumeControls
      clickToPlay
      spaceKeyToPlayOrPause
      acknowledgeRemotionLicense
      // Shared audio tags start from a data: URI that the app's CSP blocks; Electron plays media without a gesture anyway.
      numberOfSharedAudioTags={0}
      className={className}
      style={{ width: '100%', aspectRatio: `${input.width} / ${input.height}`, ...style }}
    />
  )
})

/** A still frame of the video, e.g. one scene after its entrance animation. */
export function ExplainerStill({ input, frame, className }: { input: ExplainerInput; frame: number; className?: string }) {
  return (
    <Thumbnail
      component={ExplainerVideo}
      inputProps={input}
      frameToDisplay={Math.max(0, Math.min(input.totalFrames - 1, frame))}
      durationInFrames={input.totalFrames}
      fps={input.fps}
      compositionWidth={input.width}
      compositionHeight={input.height}
      className={className}
      style={{ width: '100%', aspectRatio: `${input.width} / ${input.height}` }}
    />
  )
}

/** The frame where a scene has settled: its entrance is done, its exit has not started. */
export function settledFrame(input: ExplainerInput, index: number): number {
  const s = input.scenes[index]
  if (!s) return 0
  return s.from + Math.min(Math.round(input.fps * 2.4), Math.max(0, s.frames - 12))
}

/** A frame of scene `index` where its captions are on screen (a moment into its first spoken line). */
export function captionFrame(input: ExplainerInput, index: number): number {
  const s = input.scenes[index]
  if (!s) return 0
  const first = s.words[0]
  if (!first) return settledFrame(input, index)
  return s.from + Math.min(s.frames - 1, Math.round((first.start + 0.7) * input.fps))
}

const SAMPLE_WORDS = ['Kata', 'demi', 'kata']

/**
 * Caption look as square tiles, each drawn by the composition's own CaptionLine on the video's colors, plus
 * an "off" tile. Picking one updates the Player, which shows the real result.
 */
export function CaptionPicker({
  look,
  templateId,
  value,
  onChange
}: {
  look: ExplainerLook
  templateId: ExplainerTemplateId
  value: CaptionStyleId | 'off'
  onChange: (v: CaptionStyleId | 'off') => void
}) {
  const tile = (id: CaptionStyleId | 'off', name: string, preview: ReactNode) => {
    const on = id === value
    return (
      <button
        key={id}
        type="button"
        role="radio"
        aria-checked={on}
        onClick={() => onChange(id)}
        className={cx(
          'flex min-w-0 flex-col overflow-hidden rounded-xl text-left',
          on ? 'border-2 border-accent bg-sun-soft' : 'border border-line bg-surface hover:border-line-3'
        )}
      >
        <span className="pointer-events-none flex aspect-square w-full items-center justify-center overflow-hidden px-1" style={{ background: look.palette.bg }}>
          {preview}
        </span>
        <span className="truncate px-2 py-1.5 text-xs font-semibold">{name}</span>
      </button>
    )
  }
  // The tile is about 90 px wide: a 1080-unit frame at roughly a twelfth of its size, so sizes stay in proportion.
  const k = 0.2
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Gaya caption">
      {tile('off', 'Mati', <span className="text-center text-xs font-semibold" style={{ color: look.palette.muted }}>Tanpa caption</span>)}
      {CAPTION_STYLES.map((c) => {
        const m = CAPTION_METRICS[c.id]
        const size = m.size[0] * k * (c.id === 'bold' ? look.heading.scale * 0.8 : 1)
        return tile(
          c.id,
          c.name,
          <CaptionLine
            words={SAMPLE_WORDS}
            active={1}
            progress={0.55}
            appear={1}
            style={c.id}
            look={look}
            templateId={templateId}
            size={size}
            lineHeight={m.line}
            padX={m.padX * k}
            padY={m.padY * k}
            maxWidth={86}
          />
        )
      })}
    </div>
  )
}

/** Template choice as a grid of square cards, each with a real frame of the template's sample video. */
export function TemplatePicker({ value, onChange, columns = 4 }: { value: ExplainerTemplateId; onChange: (id: ExplainerTemplateId) => void; columns?: 2 | 4 }) {
  const samples = useMemo(() => Object.fromEntries(EXPLAINER_TEMPLATES.map((t) => [t.id, sampleExplainerInput(t.id, '16:9', PREVIEW_FONT_BASE)])), [])
  return (
    <div className={cx('grid gap-3', columns === 4 ? 'grid-cols-4' : 'grid-cols-2')} role="radiogroup" aria-label="Template video">
      {EXPLAINER_TEMPLATES.map((t) => {
        const on = t.id === value
        const input = samples[t.id] as ExplainerInput
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(t.id)}
            className={cx(
              'group relative flex aspect-square min-w-0 flex-col overflow-hidden rounded-[14px] text-left transition-shadow',
              on ? 'border-2 border-accent bg-sun-soft shadow-ink-md' : 'border border-line bg-surface hover:border-line-3'
            )}
          >
            <span className="pointer-events-none relative block w-full overflow-hidden border-b border-line">
              <ExplainerStill input={input} frame={settledFrame(input, 1)} />
              {on && (
                <span className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full border-[1.5px] border-ink bg-accent text-white">
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
              )}
            </span>
            <span className="flex min-h-0 flex-1 flex-col gap-1 px-3 pb-2.5 pt-2.5">
              <span className="text-sm font-semibold leading-tight">{t.name}</span>
              <span className="line-clamp-3 text-xs leading-snug text-ink-2">{t.blurb}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

const TEMPLATE_ICONS: Record<ExplainerTemplateId, typeof ListOrdered> = {
  tutorial: ListOrdered,
  tips: Lightbulb,
  facts: ChartNoAxesColumn,
  quote: Quote,
  compare: Swords,
  news: Newspaper
}

/** Project card cover for an explainer without a picture: the template's colors and mark. */
export function TemplateSwatch({ templateId, className }: { templateId: string | null; className?: string }) {
  const t = EXPLAINER_TEMPLATES.find((x) => x.id === templateId) ?? EXPLAINER_TEMPLATES[0]
  const p = t.palettes[0]
  const Icon = TEMPLATE_ICONS[t.id]
  return (
    <span className={cx('relative flex items-center justify-center overflow-hidden', className)} style={{ background: p.bg }}>
      <span className="absolute -bottom-8 -right-8 size-28 rounded-full" style={{ background: p.accent2, opacity: 0.85 }} />
      <span className="absolute left-4 top-4 h-2 w-16 rounded-full" style={{ background: p.accent }} />
      <Icon className="relative size-11" style={{ color: p.ink }} strokeWidth={2.2} />
    </span>
  )
}
