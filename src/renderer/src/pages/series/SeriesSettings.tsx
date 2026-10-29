import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, Info } from 'lucide-react'
import { explainerSceneCount, getTemplate } from '@shared/explainer'
import { DURATIONS, LANGUAGES, clipCountFor } from '@shared/models'
import type { KeyStatus, SeriesBundle, SeriesSettingsPatch, TtsProvider } from '@shared/types'
import { NINEROUTER_VOICES, defaultTtsVoice } from '@shared/voices'
import { TemplatePicker } from '../../components/ExplainerPreview'
import { Select } from '../../components/Select'
import { StyleMenu } from '../../components/StyleMenu'
import { Button, Modal, Segmented, Spinner, cx } from '../../components/ui'
import { errorText } from '../../lib/format'
import { TTS_NAMES, TTS_PROVIDERS, ttsReadiness } from '../../lib/keys'
import { episodeWord } from '../../lib/seriesWords'
import { useApp } from '../../store/app'
import { VoicePicker } from '../project/IdeaStep'
import { ModelSection } from '../project/ModelSection'

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-sm font-semibold">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  )
}

/**
 * The settings episodes of a series start with, editable after the series was made. Every change is saved at once
 * and goes to the episodes that have no scenes yet; episodes that already have scenes keep their own settings,
 * because their pictures and voice were made with them.
 */
export function SeriesSettingsModal({ bundle, onClose, onChange }: { bundle: SeriesBundle; onClose: () => void; onChange: (b: SeriesBundle) => void }) {
  const { toast } = useApp()
  const { series, episodes } = bundle
  const word = episodeWord(series)
  const explainer = series.kind === 'explainer'
  const [keys, setKeys] = useState<KeyStatus[]>([])
  const [saving, setSaving] = useState(0)
  const [result, setResult] = useState<{ applied: number; kept: number } | null>(null)
  // Changes are sent one after another, so a quick second pick cannot land before the first one.
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  useEffect(() => {
    void window.api.settings.keys().then(setKeys)
  }, [])

  const save = (patch: SeriesSettingsPatch): void => {
    setSaving((n) => n + 1)
    queue.current = queue.current
      .then(() => window.api.series.updateSettings(series.id, patch))
      .then((r) => {
        onChange(r.bundle)
        setResult({ applied: r.applied, kept: r.kept })
      })
      .catch((e) => toast('error', errorText(e)))
      .finally(() => setSaving((n) => n - 1))
  }

  const fresh = episodes.filter((e) => e.clipCount === 0).length
  const made = episodes.length - fresh
  const ready = ttsReadiness(keys)
  const blocked = keys.length ? TTS_PROVIDERS.filter((p) => !ready[p].ok) : []
  const template = getTemplate(series.templateId)
  const perEpisode = explainer ? explainerSceneCount(series.durationSec) : clipCountFor(series.durationSec)

  const setProvider = (p: TtsProvider): void => save({ ttsProvider: p, ttsVoice: defaultTtsVoice(p, series.language) })
  const setLanguage = (language: string): void => {
    // A 9Router voice picked from the built-in list follows the language, like in the Idea step.
    const followVoice = series.ttsProvider === 'ninerouter' && (!series.ttsVoice || NINEROUTER_VOICES.some((v) => v.id === series.ttsVoice))
    save(followVoice ? { language, ttsVoice: defaultTtsVoice('ninerouter', language) } : { language })
  }

  return (
    <Modal open onClose={onClose} title="Pengaturan seri" subtitle={`Dipakai setiap ${word.one} baru di seri ini.`} width={860}>
      <p className="flex items-start gap-2.5 rounded-xl border border-line bg-sand px-4 py-3 text-[13px] leading-relaxed text-ink-2" data-series-settings-scope>
        <Info className="mt-0.5 size-4 shrink-0 text-ink" />
        <span>
          Perubahan langsung berlaku untuk{' '}
          <b className="font-semibold text-ink">
            {fresh} {word.one} yang belum dibuat
          </b>
          {made > 0 ? (
            <>
              . {made} {word.one} yang sudah punya {explainer ? 'adegan' : 'naskah'} tetap memakai pengaturannya sendiri; ubah di halaman{' '}
              {word.one} itu kalau perlu.
            </>
          ) : (
            '.'
          )}
        </span>
      </p>

      {explainer ? (
        <>
          <Row label="Template">
            {/* The picker's square cards are too short for their text at this width, so they grow to fit it here. */}
            <div className="[&_[role=radio]]:aspect-auto">
              <TemplatePicker value={template.id} onChange={(id) => id !== template.id && save({ templateId: id })} />
            </div>
          </Row>
          <Row label="Palet warna">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Palet warna">
              {template.palettes.map((p) => {
                const on = (series.theme.paletteId ?? template.palettes[0].id) === p.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => save({ theme: { ...series.theme, paletteId: p.id } })}
                    className={cx(
                      'inline-flex h-10 items-center gap-2 rounded-full border pl-1.5 pr-3.5 text-[13px] font-medium',
                      on ? 'border-ink bg-sun-soft text-ink' : 'border-line-2 bg-surface text-ink-2 hover:border-ink-2'
                    )}
                  >
                    <span className="flex size-7 items-center justify-center rounded-full border border-ink/20" style={{ background: p.bg }}>
                      <span className="size-3 rounded-full" style={{ background: p.accent }} />
                    </span>
                    {p.name}
                  </button>
                )
              })}
            </div>
          </Row>
        </>
      ) : (
        <Row label="Gaya visual" hint="Dipakai untuk gambar klip dan lembar karakter baru.">
          <div>
            <StyleMenu value={series.styleId} onChange={(styleId) => styleId !== series.styleId && save({ styleId })} />
          </div>
        </Row>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4">
        <Row label={`Durasi per ${word.one}`} hint={`Sekitar ${perEpisode} ${explainer ? 'adegan' : 'klip'}.`}>
          <Select
            label={`Durasi per ${word.one}`}
            value={series.durationSec}
            onChange={(durationSec) => save({ durationSec })}
            options={DURATIONS.map((d) => ({ value: d.sec, label: d.label }))}
          />
        </Row>
        <Row label="Bahasa">
          <Select label="Bahasa" value={series.language} onChange={setLanguage} options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))} />
        </Row>
        <Row label="Format">
          <Segmented
            className="h-11"
            value={series.aspectRatio}
            onChange={(aspectRatio) => save({ aspectRatio })}
            options={[
              { id: '16:9', label: '16:9 · YouTube' },
              { id: '9:16', label: '9:16 · Shorts' }
            ]}
          />
        </Row>
      </div>

      <Row label="Suara narator">
        <div className="flex min-w-0 items-center gap-2">
          <Segmented
            value={series.ttsProvider}
            onChange={setProvider}
            options={TTS_PROVIDERS.map((p) => ({ id: p, label: TTS_NAMES[p], disabled: blocked.includes(p), title: ready[p].reason ?? undefined }))}
          />
          <VoicePicker
            key={series.ttsProvider === 'ninerouter' ? `ninerouter:${series.language}` : series.ttsProvider}
            provider={series.ttsProvider}
            language={series.language}
            value={series.ttsVoice}
            onChange={(ttsVoice) => ttsVoice !== series.ttsVoice && save({ ttsVoice })}
          />
        </div>
      </Row>

      <ModelSection
        imageOnly
        project={{ imageModel: series.imageModel, videoModel: series.videoModel, videoResolution: null, aspectRatio: series.aspectRatio }}
        clipCount={explainer ? Math.max(1, Math.round(perEpisode / 3)) : perEpisode}
        perClip={7}
        note={explainer ? 'Untuk adegan yang memakai gambar AI' : 'Untuk gambar klip dan lembar karakter'}
        onChange={(patch) => patch.imageModel && patch.imageModel !== series.imageModel && save({ imageModel: patch.imageModel })}
      />

      <div className="flex items-center gap-3 border-t border-line pt-4">
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] text-ink-2" data-series-settings-status>
          {saving > 0 ? (
            <>
              <Spinner className="size-3.5" />
              Menyimpan…
            </>
          ) : result ? (
            <>
              <Check className="size-3.5 text-ok-ink" strokeWidth={3} />
              Tersimpan · diterapkan ke {result.applied} {word.one} yang belum dibuat
              {result.kept > 0 ? `, ${result.kept} ${word.one} lain tidak berubah` : ''}
            </>
          ) : (
            'Perubahan tersimpan otomatis.'
          )}
        </span>
        <Button variant="primary" onClick={onClose}>
          Selesai
        </Button>
      </div>
    </Modal>
  )
}
