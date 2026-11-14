import {
  BookOpen,
  Box,
  Camera,
  Castle,
  Clapperboard,
  Cog,
  DraftingCompass,
  Droplets,
  FlaskConical,
  Hand,
  Landmark,
  Layers,
  Map as MapIcon,
  Microscope,
  PenLine,
  Pencil,
  Rocket,
  Shapes,
  Sparkles,
  Wand2,
  Zap,
  type LucideIcon
} from 'lucide-react'
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
  blueprint: DraftingCompass,
  photo: Camera,
  cinematic: Clapperboard,
  oldmap: MapIcon,
  engraving: BookOpen,
  historypaint: Landmark,
  relief: Castle,
  textbook: FlaskConical,
  micro: Microscope,
  space: Rocket,
  inventor: Cog
}

/**
 * Sample picture per style (assets/explainer-styles/<id>.webp). Missing files are normal, e.g. `auto` or a style added
 * before its thumbnail was generated, so the tile falls back to its swatch and icon instead of showing a broken image.
 */
const THUMBS = import.meta.glob('../assets/explainer-styles/*.webp', { eager: true, import: 'default' }) as Record<string, string>

/**
 * Horizontal crop focus for thumbnails whose subject is off-centre. Sources are 640x358 shown in square tiles, so the
 * default centred crop cut the cup off lineart and the gear off icon3d; the originals are gone, so we shift the crop.
 */
const THUMB_FOCUS: Record<string, string> = {
  lineart: '20% 50%',
  icon3d: '82% 50%'
}

export function explainerStyleThumb(id: string): string | null {
  return THUMBS[`../assets/explainer-styles/${id}.webp`] ?? null
}

/** Square tiles for the look of an explainer's AI pictures; it applies to pictures made after the change. */
export function ImageStylePicker({ value, onChange, columns = 3 }: { value: string | undefined; onChange: (id: string) => void; columns?: 3 | 4 | 6 }) {
  const current = getExplainerImageStyle(value).id
  return (
    <div className={cx('grid gap-2', columns === 6 ? 'grid-cols-6' : columns === 4 ? 'grid-cols-4' : 'grid-cols-3')}>
      {EXPLAINER_IMAGE_STYLES.map((s) => {
        const on = s.id === current
        const Icon = ICON[s.id] ?? Sparkles
        const thumb = explainerStyleThumb(s.id)
        return (
          <button
            key={s.id}
            type="button"
            aria-pressed={on}
            title={s.blurb}
            onClick={() => onChange(s.id)}
            className={cx('flex min-w-0 flex-col gap-1.5 rounded-xl border p-1.5 text-left', on ? 'border-line-3 bg-sun-soft' : 'border-line hover:border-line-3')}
          >
            {thumb ? (
              <span className="block aspect-square w-full overflow-hidden rounded-lg border border-line">
                <img src={thumb} alt="" draggable={false} data-style-thumb={s.id} className="size-full object-cover" style={{ objectPosition: THUMB_FOCUS[s.id] }} />
              </span>
            ) : (
              <span className="flex aspect-square w-full items-center justify-center rounded-lg border border-line" style={{ background: s.swatch, color: s.ink }}>
                <Icon className="size-[38%]" strokeWidth={1.6} />
              </span>
            )}
            <span className="truncate px-0.5 text-[12px] font-semibold leading-tight">{s.name}</span>
          </button>
        )
      })}
    </div>
  )
}
