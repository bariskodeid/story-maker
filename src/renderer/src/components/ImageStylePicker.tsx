import { Box, Camera, Clapperboard, Droplets, Hand, Layers, PenLine, Pencil, Shapes, Sparkles, Wand2, Zap, type LucideIcon } from 'lucide-react'
import { EXPLAINER_IMAGE_STYLES, getExplainerImageStyle } from '@shared/explainer'
import { cx } from './ui'

const ICON: Record<string, LucideIcon> = {
  auto: Wand2,
  flat: Shapes,
  isometric: Box,
  icon3d: Sparkles,
  lineart: PenLine,
  doodle: Pencil,
  papercut: Layers,
  watercolor: Droplets,
  clay: Hand,
  neon: Zap,
  photo: Camera,
  cinematic: Clapperboard
}

/** Square tiles for the look of an explainer's AI pictures; it applies to pictures made after the change. */
export function ImageStylePicker({ value, onChange, columns = 3 }: { value: string | undefined; onChange: (id: string) => void; columns?: 3 | 4 | 6 }) {
  const current = getExplainerImageStyle(value).id
  return (
    <div className={cx('grid gap-2', columns === 6 ? 'grid-cols-6' : columns === 4 ? 'grid-cols-4' : 'grid-cols-3')}>
      {EXPLAINER_IMAGE_STYLES.map((s) => {
        const on = s.id === current
        const Icon = ICON[s.id] ?? Sparkles
        return (
          <button
            key={s.id}
            type="button"
            aria-pressed={on}
            title={s.blurb}
            onClick={() => onChange(s.id)}
            className={cx('flex min-w-0 flex-col gap-1.5 rounded-xl border p-1.5 text-left', on ? 'border-line-3 bg-sun-soft' : 'border-line hover:border-line-3')}
          >
            <span className="flex aspect-square w-full items-center justify-center rounded-lg border border-line" style={{ background: s.swatch, color: s.ink }}>
              <Icon className="size-[38%]" strokeWidth={1.6} />
            </span>
            <span className="truncate px-0.5 text-[12px] font-semibold leading-tight">{s.name}</span>
          </button>
        )
      })}
    </div>
  )
}
