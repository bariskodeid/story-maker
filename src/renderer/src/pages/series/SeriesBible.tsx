import type { ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import type { Series, SeriesCharacter, SeriesPatch } from '@shared/types'
import { CharacterAvatar } from '../../components/CharacterAvatar'
import { IconButton, confirmDialog } from '../../components/ui'
import { errorText } from '../../lib/format'
import { useApp } from '../../store/app'
import { AutosaveText } from './AutosaveText'

const areaCls =
  'w-full rounded-xl border border-line-2 bg-surface px-3 py-2 text-sm leading-relaxed text-ink outline-none transition-colors placeholder:text-muted/80 focus:border-ink'

function Part({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-ink">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  )
}

// An explainer series keeps the same bible fields; `world` holds who the series is for and what it covers.
const LABELS = {
  story: {
    intro: 'AI membaca ini setiap menulis naskah episode. Perubahan tersimpan otomatis.',
    premise: 'Premis',
    world: 'Dunia',
    worldHint: 'Tempat, zaman, dan aturan dunianya.',
    tone: 'Nada',
    rulesHint: 'Satu aturan per baris, misalnya hal yang tidak boleh terjadi.'
  },
  explainer: {
    intro: 'AI membaca ini setiap menyusun adegan. Perubahan tersimpan otomatis.',
    premise: 'Topik seri',
    world: 'Penonton & cakupan',
    worldHint: 'Untuk siapa seri ini, apa yang sudah mereka tahu, dan apa saja yang dibahas.',
    tone: 'Gaya bicara',
    rulesHint: 'Satu aturan per baris, misalnya istilah yang dipakai, versi aplikasi, atau hal yang tidak dibahas.'
  }
}

/** Premise and bible of a series; every episode script (or explainer scene list) is written from them. */
export function BiblePanel({ series, onChange }: { series: Series; onChange: (s: Series) => void }) {
  const { toast } = useApp()
  const L = LABELS[series.kind]
  const save = (patch: SeriesPatch): void => {
    window.api.series
      .update(series.id, patch)
      .then(onChange)
      .catch((e) => toast('error', errorText(e)))
  }
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
      <div>
        <h2 className="font-display text-xl font-bold">Bible seri</h2>
        <p className="mt-1 text-[13px] text-ink-2">{L.intro}</p>
      </div>
      <Part label={L.premise}>
        <AutosaveText multiline minRows={3} label={series.kind === 'explainer' ? 'Topik seri' : 'Premis seri'} value={series.premise} onSave={(premise) => save({ premise })} className={areaCls} />
      </Part>
      <Part label={L.world} hint={L.worldHint}>
        <AutosaveText multiline minRows={3} label={`${L.world} seri`} value={series.bible.world} onSave={(world) => save({ world })} className={areaCls} />
      </Part>
      <Part label={L.tone}>
        <AutosaveText multiline minRows={2} label={`${L.tone} seri`} value={series.bible.tone} onSave={(tone) => save({ tone })} className={areaCls} />
      </Part>
      <Part label="Aturan" hint={L.rulesHint}>
        <AutosaveText multiline minRows={3} label="Aturan seri" value={series.bible.rules} onSave={(rules) => save({ rules })} className={areaCls} />
      </Part>
    </section>
  )
}

/** The shared cast. A sheet appears once an episode made it; later episodes get a copy instead of a new drawing. */
export function CastPanel({ characters, onChange }: { characters: SeriesCharacter[]; onChange: () => void }) {
  const { toast } = useApp()
  const update = (c: SeriesCharacter, patch: { name?: string; description?: string }): void => {
    window.api.series
      .updateCharacter(c.id, patch)
      .then(onChange)
      .catch((e) => toast('error', errorText(e)))
  }
  const remove = async (c: SeriesCharacter): Promise<void> => {
    const ok = await confirmDialog({
      title: `Hapus ${c.name} dari pemeran seri?`,
      body: 'Episode berikutnya tidak lagi mendapat pemeran ini. Episode yang sudah ada tetap menyimpan salinannya sendiri.',
      confirm: 'Hapus pemeran',
      danger: true
    })
    if (!ok) return
    await window.api.series.removeCharacter(c.id).catch((e) => toast('error', errorText(e)))
    onChange()
  }
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
      <div>
        <h2 className="flex items-baseline gap-2 font-display text-xl font-bold">
          Pemeran
          <span className="font-sans text-sm font-medium text-muted">{characters.length}</span>
        </h2>
        <p className="mt-1 text-[13px] text-ink-2">Lembar karakter dibuat sekali di episode pertama yang memakainya, lalu dipakai ulang di episode lain.</p>
      </div>
      {characters.length === 0 && <p className="text-[13px] text-muted">Pemeran muncul setelah rencana seri disusun.</p>}
      <ul className="flex flex-col gap-3.5">
        {characters.map((c) => (
          <li key={c.id} className="flex gap-3" data-cast={c.name}>
            {c.sheetUrl ? (
              <img
                src={c.sheetUrl}
                alt={`Lembar karakter ${c.name}`}
                title="Lembar karakter"
                className="aspect-video w-[112px] shrink-0 self-start rounded-lg border border-line bg-sand object-cover"
              />
            ) : (
              <span className="flex w-[112px] shrink-0 flex-col items-center gap-1 self-start pt-1 text-center text-[11px] text-muted" title="Belum ada lembar karakter">
                <CharacterAvatar name={c.name} size={40} />
                Belum ada lembar
              </span>
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <AutosaveText
                label={`Nama ${c.name}`}
                value={c.name}
                onSave={(name) => update(c, { name })}
                className="-ml-1 min-w-0 rounded-md bg-transparent px-1 text-[15px] font-semibold outline-none hover:bg-sand focus:bg-sand"
              />
              <AutosaveText
                multiline
                minRows={2}
                maxHeight={160}
                label={`Deskripsi ${c.name}`}
                value={c.description}
                onSave={(description) => update(c, { description })}
                className="w-full rounded-lg border border-transparent bg-transparent px-1 text-xs leading-relaxed text-ink-2 outline-none hover:border-line focus:border-ink focus:bg-surface"
              />
            </div>
            <IconButton label={`Hapus ${c.name}`} size={32} className="border-transparent" onClick={() => void remove(c)}>
              <Trash2 className="size-4" />
            </IconButton>
          </li>
        ))}
      </ul>
    </section>
  )
}
