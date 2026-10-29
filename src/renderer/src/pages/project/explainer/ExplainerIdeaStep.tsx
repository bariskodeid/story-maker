import { useEffect, useState } from 'react'
import { Bot, Sparkles } from 'lucide-react'
import { explainerSceneCount, getTemplate, type ExplainerTemplateId } from '@shared/explainer'
import { DURATIONS, LANGUAGES, llmName } from '@shared/models'
import type { KeyStatus, LlmProvider } from '@shared/types'
import { NINEROUTER_VOICES, defaultTtsVoice } from '@shared/voices'
import { TemplatePicker } from '../../../components/ExplainerPreview'
import { Select } from '../../../components/Select'
import { Button, Chip, Field, Segmented, confirmDialog, cx } from '../../../components/ui'
import { errorText } from '../../../lib/format'
import { TTS_NAMES, TTS_PROVIDERS, ttsReadiness, usableTts } from '../../../lib/keys'
import { useApp } from '../../../store/app'
import { useProject } from '../../../store/project'
import { VoicePicker } from '../IdeaStep'
import { ModelSection } from '../ModelSection'

const PLACEHOLDERS: Record<ExplainerTemplateId, string> = {
  tutorial: 'Cara membuat repositori Git pertama dan menyimpan perubahan kode untuk pemula…',
  tips: '5 trik supaya tetap fokus saat kerja dari rumah…',
  facts: 'Fakta mengejutkan tentang matahari yang jarang diketahui orang…',
  quote: 'Kutipan tokoh dunia tentang memulai dari langkah kecil…'
}

/** Explainer step 1: topic, template, length, format, narrator and the AI image model. */
export function ExplainerIdeaStep() {
  const { project, clips, updateProject, flush, load } = useProject()
  const { toast, go } = useApp()
  const [busy, setBusy] = useState(false)
  const [writer, setWriter] = useState<{ provider: LlmProvider; model: string } | null>(null)
  const [keys, setKeys] = useState<KeyStatus[]>([])

  useEffect(() => {
    void window.api.settings.get().then((s) => setWriter({ provider: s.llmProvider, model: s.llmModels[s.llmProvider] }))
    void window.api.settings.keys().then(setKeys)
  }, [])

  const hasVoice = clips.some((c) => c.audioAssetId)
  useEffect(() => {
    if (!project || !keys.length || hasVoice) return
    const use = usableTts(project.ttsProvider, keys)
    if (use !== project.ttsProvider) updateProject({ ttsProvider: use, ttsVoice: defaultTtsVoice(use, project.language) })
  }, [keys, project?.id])

  if (!project) return null
  const template = getTemplate(project.templateId)
  const ready = ttsReadiness(keys)
  const blocked = keys.length ? TTS_PROVIDERS.filter((p) => !ready[p].ok) : []
  const count = explainerSceneCount(project.durationSec)
  const openSettings = async (): Promise<void> => {
    await flush()
    go({ name: 'settings', back: { name: 'project', id: project.id } })
  }

  const write = async (): Promise<void> => {
    if (!project.synopsis.trim()) return toast('error', 'Tulis topik videonya dulu.')
    if (clips.length) {
      const ok = await confirmDialog({
        title: 'Tulis ulang semua adegan?',
        body: `Proyek ini sudah punya ${clips.length} adegan. Menulis ulang mengganti semua adegan beserta narasinya. Gambar dan suara lama tersimpan di riwayat tapi tidak lagi terpasang.`,
        confirm: 'Tulis ulang'
      })
      if (!ok) return
    }
    setBusy(true)
    try {
      await flush()
      const bundle = await window.api.explainer.scenes(project.id)
      load(bundle)
      toast('success', `${bundle.clips.length} adegan siap. Cek teks dan gambarnya, lalu buat narasinya.`)
    } catch (e) {
      toast('error', errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative h-full">
      <div className="scroll-thin h-full overflow-y-auto pb-28">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-[22px] px-14 pt-8">
          <div>
            <p className="text-[13px] font-semibold text-accent">Langkah 1 dari 3</p>
            <h1 className="mt-1.5 font-display text-[40px] font-bold leading-tight tracking-[-0.02em]">Topik dan template</h1>
            <p className="mt-2 text-[15px] text-ink-2">
              Tulis apa yang mau kamu jelaskan. AI menyusun adegan dan narasinya sesuai template, lalu kamu tinggal merapikan.
            </p>
          </div>

          <div className="flex flex-col gap-2 rounded-2xl border-[1.5px] border-ink bg-surface px-[18px] pb-3 pt-4 shadow-ink-md">
            <label htmlFor="topik" className="text-[13px] font-semibold text-ink-2">
              Topik atau ide video
            </label>
            <textarea
              id="topik"
              rows={4}
              value={project.synopsis}
              maxLength={4000}
              onChange={(e) => updateProject({ synopsis: e.target.value })}
              placeholder={PLACEHOLDERS[template.id]}
              className="resize-none bg-transparent text-base leading-relaxed outline-none placeholder:text-muted/70"
            />
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Tips: sebut untuk siapa videonya dan hasil akhir yang diharapkan.</span>
              <span className="font-mono">{project.synopsis.length.toLocaleString('id-ID')} / 4.000</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold">Template</span>
            <TemplatePicker value={template.id} onChange={(id) => updateProject({ templateId: id })} />
          </div>

          <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] gap-5">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold">Durasi video</span>
              <div className="flex flex-wrap gap-2">
                {DURATIONS.slice(0, 4).map((d) => (
                  <Chip key={d.sec} on={project.durationSec === d.sec} onClick={() => updateProject({ durationSec: d.sec })} className="h-10 px-4">
                    {d.label}
                  </Chip>
                ))}
              </div>
              <span className="text-[13px] text-muted">Sekitar {count} adegan. Durasi akhir mengikuti panjang narasi.</span>
            </div>
            <Field label="Bahasa">
              <Select
                label="Bahasa"
                size="lg"
                value={project.language}
                onChange={(v) => {
                  const followVoice = project.ttsProvider === 'ninerouter' && (!project.ttsVoice || NINEROUTER_VOICES.some((x) => x.id === project.ttsVoice))
                  updateProject(followVoice ? { language: v, ttsVoice: defaultTtsVoice('ninerouter', v) } : { language: v })
                }}
                options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
              />
            </Field>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">Format</span>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: '16:9', label: '16:9', sub: 'YouTube', w: 26, h: 15 },
                    { id: '9:16', label: '9:16', sub: 'Shorts', w: 13, h: 22 }
                  ] as const
                ).map((f) => {
                  const on = project.aspectRatio === f.id
                  return (
                    <button
                      key={f.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => updateProject({ aspectRatio: f.id })}
                      className={cx(
                        'flex h-12 items-center gap-2.5 rounded-xl px-3 text-left',
                        on ? 'border-2 border-accent bg-accent-soft' : 'border border-line-2 bg-surface hover:border-ink-2'
                      )}
                    >
                      <span className="flex w-[26px] justify-center">
                        <span className="rounded-[3px] border-[1.8px] border-ink" style={{ width: f.w, height: f.h }} />
                      </span>
                      <span className="flex flex-col leading-tight">
                        <span className="text-sm font-semibold">{f.label}</span>
                        <span className="text-xs text-ink-2">{f.sub}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold">Suara narator</span>
            <div className="flex items-center gap-2">
              <Segmented
                value={project.ttsProvider}
                onChange={(v) => updateProject({ ttsProvider: v, ttsVoice: defaultTtsVoice(v, project.language) })}
                options={TTS_PROVIDERS.map((p) => ({ id: p, label: TTS_NAMES[p], disabled: blocked.includes(p), title: ready[p].reason ?? undefined }))}
              />
              <VoicePicker
                key={project.ttsProvider === 'ninerouter' ? `ninerouter:${project.language}` : project.ttsProvider}
                provider={project.ttsProvider}
                language={project.language}
                value={project.ttsVoice}
                onChange={(v) => updateProject({ ttsVoice: v })}
              />
            </div>
            {blocked.length === TTS_PROVIDERS.length && (
              <span className="text-[13px] text-muted">
                Belum ada kunci suara narator yang valid.{' '}
                <button type="button" onClick={() => void openSettings()} className="font-semibold text-accent-dark hover:underline">
                  Atur di Pengaturan
                </button>
              </span>
            )}
          </div>

          <ModelSection
            imageOnly
            project={project}
            clipCount={Math.max(1, Math.round(count / 3))}
            perClip={7}
            onChange={(patch) => {
              updateProject(patch)
              if (patch.imageModel) void window.api.settings.set({ imageModel: patch.imageModel })
            }}
            onOpenSettings={() => void openSettings()}
          />
        </div>
      </div>

      <footer className="absolute inset-x-0 bottom-0 flex h-[84px] items-center gap-4 border-t border-line bg-surface px-14">
        <div className="flex flex-col gap-0.5">
          <span className="text-[15px] font-semibold">
            ± {count} adegan · {template.name}
          </span>
          <span className="flex items-center gap-1.5 text-[13px] text-muted">
            <Bot className="size-3.5" />
            Ditulis oleh {writer ? `${llmName(writer.provider)} · ` : ''}
            <span className={cx('font-mono', writer && !writer.model && 'text-accent-dark')}>{writer ? writer.model || 'model belum dipilih' : '…'}</span>
            <button type="button" onClick={() => void openSettings()} className="font-semibold text-accent-dark hover:underline">
              Ganti
            </button>
          </span>
        </div>
        <div className="flex-1" />
        {clips.length > 0 && !busy && (
          <Button size="lg" onClick={() => updateProject({ step: 2, status: project.status === 'draft' ? 'script' : project.status })}>
            Lihat adegan
          </Button>
        )}
        <Button variant="primary" size="lg" className="h-[50px]" loading={busy} icon={!busy && <Sparkles className="size-[18px]" />} onClick={() => void write()}>
          {clips.length ? 'Tulis ulang adegan' : 'Tulis adegan'}
        </Button>
      </footer>
    </div>
  )
}
