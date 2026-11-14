import { useRef, useState } from 'react'
import { Pencil, Plus, User } from 'lucide-react'
import { DEFAULT_NARRATOR } from '@shared/narrator'
import type { Narrator, NarratorSettings } from '@shared/types'
import { useNarrators } from '../lib/narrators'
import { NarratorDialog } from './NarratorDialog'
import { Button, Segmented, Switch, cx } from './ui'

/**
 * The narrator section of a project or series: the collection as square tiles, an on/off switch, and where and how
 * big the narrator sits. A narrator that was deleted after being picked is shown as gone and counts as off.
 */
export function NarratorPicker({
  value,
  onChange,
  defaultStyle
}: {
  value: NarratorSettings | undefined
  onChange: (next: NarratorSettings) => void
  /** New narrators start in the look of the project's pictures. */
  defaultStyle: Narrator['style']
}) {
  const settings = value ?? DEFAULT_NARRATOR
  const { list, reload } = useNarrators()
  const [dialog, setDialog] = useState<{ narrator: Narrator | null } | null>(null)
  const picked = list?.find((n) => n.id === settings.id) ?? null
  const gone = !!list && !!settings.id && !picked
  const on = settings.enabled && !!picked && picked.status === 'ready'
  // Two quick changes in one tick must both land, so each builds on the latest value, not the rendered one.
  const latest = useRef(settings)
  latest.current = settings
  const set = (patch: Partial<NarratorSettings>): void => {
    latest.current = { ...latest.current, ...patch }
    onChange(latest.current)
  }

  const toggle = (enabled: boolean): void => {
    if (!enabled) return set({ enabled: false })
    // Switching on with nothing usable picked takes the first narrator that already has sprites.
    if (picked) return set({ enabled: true })
    const first = list?.find((n) => n.status === 'ready')
    if (first) set({ id: first.id, enabled: true })
    else set({ enabled: true })
  }

  const onChanged = (selectId?: string): void => {
    void reload().then((next) => {
      if (selectId && next.some((n) => n.id === selectId)) set({ id: selectId })
    })
  }

  return (
    <div className="flex flex-col gap-3" data-narrator-picker>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-sm font-semibold">Narator animasi</span>
          <span className="text-[13px] text-muted">Tokoh di pojok video yang membuka mulut dan berganti ekspresi saat bicara.</span>
        </div>
        <Switch on={on} onChange={toggle} label="Tampilkan narator animasi" />
      </div>

      {gone && (
        <p className="rounded-xl border border-line bg-sand px-3.5 py-2.5 text-[13px] text-ink-2" data-narrator-gone>
          Narator sudah dihapus. Pilih narator lain supaya muncul di video.
        </p>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,104px))] gap-2" role="radiogroup" aria-label="Narator">
        {(list ?? []).map((n) => {
          const sel = n.id === settings.id
          const ready = n.status === 'ready'
          return (
            <button
              key={n.id}
              type="button"
              role="radio"
              aria-checked={sel}
              data-narrator-id={n.id}
              title={ready ? n.name : `${n.name} (sprite belum dibuat)`}
              onClick={() => (ready ? set({ id: n.id, enabled: settings.enabled || !settings.id }) : setDialog({ narrator: n }))}
              className={cx('flex min-w-0 flex-col gap-1.5 rounded-xl border p-1.5 text-left', sel ? 'border-line-3 bg-sun-soft' : 'border-line hover:border-line-3')}
            >
              <span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-line bg-sand">
                {n.thumbUrl ? (
                  <img src={n.thumbUrl} alt="" draggable={false} className={cx('size-full object-cover', !ready && 'opacity-40')} />
                ) : (
                  <User className="size-1/3 text-muted" strokeWidth={1.5} />
                )}
              </span>
              <span className="truncate px-0.5 text-[12px] font-semibold leading-tight">{n.name}</span>
            </button>
          )
        })}
        <button
          type="button"
          data-narrator-new
          onClick={() => setDialog({ narrator: null })}
          className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-dashed border-line-3 p-1.5 text-left hover:bg-sun-soft"
        >
          <span className="flex aspect-square w-full items-center justify-center rounded-lg text-ink-2">
            <Plus className="size-1/3" strokeWidth={1.5} />
          </span>
          <span className="truncate px-0.5 text-[12px] font-semibold leading-tight">Buat narator</span>
        </button>
      </div>

      {picked && (
        <div>
          <Button size="sm" icon={<Pencil className="size-3.5" />} onClick={() => setDialog({ narrator: picked })} data-narrator-edit>
            {picked.preset ? 'Lihat narator' : 'Ubah narator'}
          </Button>
        </div>
      )}

      {on && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-ink-2">Posisi</span>
            <Segmented
              size="sm"
              value={settings.anchor}
              onChange={(anchor) => set({ anchor })}
              options={[
                { id: 'bottomLeft', label: 'Kiri bawah' },
                { id: 'bottomRight', label: 'Kanan bawah' }
              ]}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-ink-2">Ukuran</span>
            <Segmented
              size="sm"
              value={settings.size}
              onChange={(size) => set({ size })}
              options={[
                { id: 'small', label: 'Kecil' },
                { id: 'medium', label: 'Sedang' },
                { id: 'large', label: 'Besar' }
              ]}
            />
          </div>
        </div>
      )}

      {dialog && <NarratorDialog narrator={dialog.narrator} defaultStyle={defaultStyle} onClose={() => setDialog(null)} onChanged={onChanged} />}
    </div>
  )
}
