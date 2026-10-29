import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  FolderOpen,
  Layers,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  Trash2,
  Wand2
} from 'lucide-react'
import { explainerSceneCount, getTemplate } from '@shared/explainer'
import { imageSourceAside, imageSourceSentence } from '@shared/imageModels'
import { DURATIONS, clipCountFor } from '@shared/models'
import { MAX_EPISODES, episodeTag, stripEpisodeTag } from '@shared/series'
import { getStyle } from '@shared/styles'
import type { ProjectKind, ProjectStatus, Series, SeriesBundle, SeriesEpisode } from '@shared/types'
import { TemplateSwatch } from '../../components/ExplainerPreview'
import { StyleSwatch } from '../../components/StyleArt'
import { Badge, Button, IconButton, Menu, Progress, Spinner, Switch, confirmDialog, cx } from '../../components/ui'
import { exportOption, useAutopilot, type AutopilotStage } from '../../lib/autopilot'
import { errorText, joinList, mmss } from '../../lib/format'
import { missingServices } from '../../lib/keys'
import { continuityLabel, episodeWord } from '../../lib/seriesWords'
import {
  dismissSeriesAutopilot,
  planSeries,
  runEpisode,
  seriesExportFolder,
  setSeriesAutoExport,
  startSeriesAutopilot,
  stopSeriesAutopilot,
  useSeriesAutopilot,
  type SeriesRun
} from '../../lib/seriesAutopilot'
import { useApp } from '../../store/app'
import { AutosaveText } from './AutosaveText'
import { BiblePanel, CastPanel } from './SeriesBible'
import { SeriesSettingsModal } from './SeriesSettings'

const STATUS: Record<ProjectStatus, { label: string; tone: 'draft' | 'info' | 'warn' | 'ok' }> = {
  draft: { label: 'Draf', tone: 'draft' },
  script: { label: 'Naskah', tone: 'info' },
  storyboard: { label: 'Storyboard', tone: 'info' },
  editing: { label: 'Siap di editor', tone: 'warn' },
  exported: { label: 'Diekspor', tone: 'ok' }
}

const STAGE_LABEL: Record<ProjectKind, Record<AutopilotStage, string>> = {
  story: {
    script: 'menulis naskah',
    visuals: 'menyusun rencana visual',
    media: 'membuat gambar dan narasi',
    finish: 'memindahkan ke editor',
    export: 'mengekspor MP4'
  },
  explainer: {
    script: 'menyusun adegan',
    visuals: 'menyusun adegan',
    media: 'membuat gambar AI dan narasi',
    finish: 'memindahkan ke editor',
    export: 'merender MP4'
  }
}

const isReady = (e: SeriesEpisode): boolean => e.status === 'editing' || e.status === 'exported'

/**
 * Checks the services a one-click run will call; shows what is missing and returns null. Explainer scenes work
 * without pictures, so an explainer series only needs the writer and the narrator.
 */
async function servicesReady(
  series: Series,
  back: () => void
): Promise<{ autoExport: boolean; imageModel: string; imagesReady: boolean } | null> {
  const [settings, keys] = await Promise.all([window.api.settings.get(), window.api.settings.keys()])
  const imageModel = series.imageModel ?? settings.imageModel
  const explainer = series.kind === 'explainer'
  const missing = missingServices(settings, keys, { story: true, imageModel: explainer ? null : imageModel, tts: series.ttsProvider })
  if (missing.length) {
    useApp.getState().toast('error', `Atur dulu ${joinList(missing)} di Pengaturan.`, { label: 'Buka Pengaturan', run: back })
    return null
  }
  const imagesReady = missingServices(settings, keys, { story: false, imageModel, tts: null }).length === 0
  return { autoExport: settings.autoExport, imageModel, imagesReady }
}

/** How the AI pictures of an explainer run are made, for the start dialogs. */
function explainerImageText(ready: { imageModel: string; imagesReady: boolean }): string {
  return ready.imagesReady
    ? `Gambar AI hanya dibuat untuk adegan yang membutuhkannya${imageSourceAside(ready.imageModel)}. `
    : 'Layanan gambar belum diatur, jadi adegan tampil tanpa gambar AI. '
}

function SeriesHeader({
  series,
  episodes,
  running,
  busy,
  onRename,
  onRemove,
  onStart,
  onStop,
  onSettings,
  stopping
}: {
  series: Series
  episodes: number
  running: boolean
  /** A plan or a run is working on the series, so its settings stay as they are. */
  busy: boolean
  stopping: boolean
  onRename: (title: string) => void
  onRemove: () => void
  onStart: () => void
  onStop: () => void
  onSettings: () => void
}) {
  const { go } = useApp()
  const [editing, setEditing] = useState(false)
  const duration = DURATIONS.find((d) => d.sec === series.durationSec)?.label ?? `${series.durationSec} detik`
  const word = episodeWord(series)
  const explainer = series.kind === 'explainer'
  return (
    <header className="grid h-[68px] shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-line bg-surface px-6">
      <div className="flex min-w-0 items-center gap-3">
        <IconButton label="Kembali ke beranda" onClick={() => go({ name: 'home' })}>
          <ArrowLeft className="size-[18px]" />
        </IconButton>
        {explainer ? (
          <span className="size-10 shrink-0 overflow-hidden rounded-xl border-[1.5px] border-ink" title={getTemplate(series.templateId).name}>
            <TemplateSwatch templateId={series.templateId} className="size-full [&_svg]:size-5" />
          </span>
        ) : (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border-[1.5px] border-ink bg-sun text-ink">
            <Layers className="size-5" />
          </span>
        )}
        <div className="flex min-w-0 flex-col gap-px">
          <div className="flex min-w-0 items-center gap-1">
            {editing ? (
              <input
                autoFocus
                defaultValue={series.title}
                aria-label="Judul seri"
                onBlur={(e) => {
                  onRename(e.target.value.trim() || series.title)
                  setEditing(false)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  if (e.key === 'Escape') setEditing(false)
                }}
                className="h-8 w-[360px] rounded-lg border border-ink bg-surface px-2 font-display text-lg font-bold outline-none"
              />
            ) : (
              <>
                <h1 className="truncate font-display text-lg font-bold">{series.title}</h1>
                <button
                  type="button"
                  aria-label="Ganti judul seri"
                  onClick={() => setEditing(true)}
                  className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-sand hover:text-ink"
                >
                  <Pencil className="size-[15px]" />
                </button>
              </>
            )}
          </div>
          <span className="truncate text-xs text-ink-2" data-series-subtitle>
            {continuityLabel(series)} · {episodes} {word.one} · {duration} per {word.one} ·{' '}
            {explainer ? getTemplate(series.templateId).name : getStyle(series.styleId).name} · {series.aspectRatio}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <span title={busy ? 'Hentikan dulu pembuatan otomatis untuk mengubah pengaturan seri.' : undefined}>
          <Button icon={<Settings2 className="size-[17px]" />} disabled={busy} onClick={onSettings}>
            Pengaturan seri
          </Button>
        </span>
        <IconButton label="Pengaturan aplikasi" onClick={() => go({ name: 'settings', back: { name: 'series', id: series.id } })}>
          <SlidersHorizontal className="size-[18px]" />
        </IconButton>
        <Menu
          trigger={(open) => (
            <IconButton label="Opsi seri" onClick={open}>
              <MoreHorizontal className="size-[18px]" />
            </IconButton>
          )}
          items={[{ label: 'Hapus seri', icon: <Trash2 className="size-4" />, danger: true, run: onRemove }]}
        />
        {running ? (
          <Button loading={stopping} onClick={onStop}>
            Hentikan
          </Button>
        ) : (
          <Button variant="primary" icon={<Wand2 className="size-[17px]" />} onClick={onStart}>
            Buat semua {word.one} sekali klik
          </Button>
        )}
      </div>
    </header>
  )
}

/** Progress of the whole-series run: which episode, which step, and stop/resume. */
function RunCard({ run, bundle }: { run: SeriesRun; bundle: SeriesBundle }) {
  const { go } = useApp()
  const episodeRun = useAutopilot((s) => (run.current ? s.runs[run.current.id] : undefined))
  const total = run.total || bundle.episodes.length
  const ready = bundle.episodes.filter(isReady).length
  const word = episodeWord(bundle.series)
  const kind = bundle.series.kind
  const title =
    run.state === 'running' ? `Membuat semua ${word.one} otomatis` : run.state === 'stopped' ? 'Pembuatan seri dihentikan' : 'Pembuatan seri terhenti'
  const detail =
    run.stage === 'plan'
      ? kind === 'explainer'
        ? `Menyusun bible dan rencana tiap ${word.one}…`
        : 'Menyusun bible, pemeran, dan rencana tiap episode…'
      : run.current
        ? `${word.title} ${run.current.no} dari ${total}: ${run.current.title}${run.state === 'running' && episodeRun?.state === 'running' ? ` · ${STAGE_LABEL[kind][episodeRun.stage]}` : ''}`
        : `Menyiapkan ${word.one}…`
  return (
    <section className="flex flex-col gap-4 rounded-2xl border-[1.5px] border-ink bg-surface p-5 shadow-ink" data-series-run={run.state}>
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border-[1.5px] border-ink bg-accent text-white">
          {run.state === 'running' ? <Spinner className="size-5" /> : <Wand2 className="size-5" />}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="font-display text-xl font-bold leading-tight">{title}</h2>
          <p className="text-sm text-ink-2" data-series-detail>
            {detail}
          </p>
        </div>
        <div className="flex-1" />
        <span className="shrink-0 font-mono text-sm text-ink-2">
          {ready}/{total} siap
        </span>
      </div>
      <Progress value={total ? ready / total : 0} />
      <ol className="flex flex-wrap gap-1.5">
        {bundle.episodes.map((e) => {
          const current = run.current?.id === e.id
          const failed = current && run.state === 'failed'
          return (
            <li
              key={e.id}
              className={cx(
                'inline-flex h-7 items-center gap-1 rounded-full border px-2.5 font-mono text-xs',
                isReady(e) && !current
                  ? 'border-ok-ink/30 bg-ok-soft text-ok-ink'
                  : failed
                    ? 'border-bad-ink/40 bg-bad-soft text-bad-ink'
                    : current
                      ? 'border-ink bg-sun-soft text-ink'
                      : 'border-line-2 bg-surface text-muted'
              )}
            >
              {isReady(e) && !current ? <Check className="size-3" strokeWidth={3} /> : current && run.state === 'running' ? <Spinner className="size-3" /> : null}
              {failed && <AlertTriangle className="size-3" />}
              {episodeTag(e.no)}
            </li>
          )
        })}
      </ol>
      {run.state === 'failed' && run.error && (
        <p className="flex items-start gap-2 rounded-xl border border-bad-ink/30 bg-bad-soft px-4 py-3 text-sm text-bad-ink">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {run.error}
        </p>
      )}
      {run.state === 'running' && (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-paper px-3.5 py-2.5">
          <Switch on={run.exportAfter} label="Ekspor MP4 otomatis" onChange={(on) => setSeriesAutoExport(run.seriesId, on)} />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-ink">Ekspor MP4 tiap {word.one} setelah selesai</span>
            <span className="text-[13px] text-ink-2">Satu file per {word.one} di subfolder seri, di folder ekspor bawaan.</span>
          </span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2.5">
        {run.current && (
          <Button size="sm" onClick={() => go({ name: 'project', id: run.current!.id })}>
            Lihat {word.one} {run.current.no}
          </Button>
        )}
        {run.state === 'running' ? (
          <span className="text-[13px] text-muted">
            {word.title} dibuat satu per satu. Kamu boleh pindah halaman, prosesnya tetap berjalan selama aplikasi terbuka.
          </span>
        ) : (
          <>
            <Button size="sm" variant="primary" icon={<Wand2 className="size-4" />} onClick={() => startSeriesAutopilot(run.seriesId)}>
              {run.state === 'stopped' ? 'Lanjutkan' : 'Coba lagi'}
            </Button>
            <Button size="sm" onClick={() => dismissSeriesAutopilot(run.seriesId)}>
              Tutup
            </Button>
            <span className="text-[13px] text-muted">{word.title} yang sudah selesai tidak diulang.</span>
          </>
        )}
      </div>
    </section>
  )
}

function EpisodeRow({
  ep,
  series,
  locked,
  current,
  onChanged,
  onRunOne,
  onRemove
}: {
  ep: SeriesEpisode
  series: Series
  locked: boolean
  current: boolean
  onChanged: () => void
  onRunOne: () => void
  onRemove: () => void
}) {
  const { go, toast } = useApp()
  const auto = useAutopilot((s) => s.runs[ep.id])
  const portrait = series.aspectRatio === '9:16'
  const word = episodeWord(series)
  const explainer = series.kind === 'explainer'
  const save = (patch: { title?: string; synopsis?: string; summary?: string }): void => {
    window.api.series
      .updateEpisode(ep.id, patch)
      .then(onChanged)
      .catch((e) => toast('error', errorText(e)))
  }
  const badge =
    auto?.state === 'running' ? (
      <Badge tone="info">Dibuat otomatis…</Badge>
    ) : auto?.state === 'failed' ? (
      <Badge tone="bad">Gagal otomatis</Badge>
    ) : auto?.state === 'stopped' ? (
      <Badge tone="draft">Dihentikan</Badge>
    ) : (
      <Badge tone={STATUS[ep.status].tone}>{STATUS[ep.status].label}</Badge>
    )
  return (
    <article
      data-episode={ep.no}
      className={cx(
        'flex gap-4 rounded-2xl border bg-surface p-4 transition-colors focus-within:border-ink-2',
        current ? 'border-ink shadow-ink' : 'border-line'
      )}
    >
      <button
        type="button"
        onClick={() => go({ name: 'project', id: ep.id })}
        aria-label={`Buka ${word.one} ${ep.no}`}
        className={cx(
          'relative shrink-0 self-start overflow-hidden rounded-xl border border-line bg-sand',
          portrait ? 'aspect-[9/16] w-[96px]' : 'aspect-video w-[176px]'
        )}
      >
        {ep.coverUrl ? (
          <img src={ep.coverUrl} alt="" className="size-full object-cover" />
        ) : explainer ? (
          <TemplateSwatch templateId={ep.templateId ?? series.templateId} className="size-full" />
        ) : (
          <StyleSwatch styleId={series.styleId} className="size-full" iconSize={28} />
        )}
        <span className="absolute left-2 top-2 rounded-md bg-ink px-1.5 py-0.5 font-mono text-xs text-paper">{episodeTag(ep.no)}</span>
        {ep.totalMs > 0 && <span className="absolute bottom-2 right-2 rounded-md bg-ink/80 px-1.5 py-0.5 font-mono text-[11px] text-paper">{mmss(ep.totalMs)}</span>}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-2">
          <AutosaveText
            label={`Judul ${word.one} ${ep.no}`}
            value={stripEpisodeTag(ep.title)}
            onSave={(title) => save({ title })}
            className="-ml-1 min-w-0 flex-1 rounded-md bg-transparent px-1 font-display text-lg font-bold outline-none hover:bg-sand focus:bg-sand"
          />
          {badge}
          <Menu
            trigger={(open) => (
              <IconButton label={`Opsi ${word.one} ${ep.no}`} size={34} className="border-transparent" onClick={open}>
                <MoreHorizontal className="size-4" />
              </IconButton>
            )}
            items={[
              { label: 'Buka', icon: <FolderOpen className="size-4" />, run: () => go({ name: 'project', id: ep.id }) },
              ...(locked ? [] : [{ label: `Hapus ${word.one}`, icon: <Trash2 className="size-4" />, danger: true, run: onRemove }])
            ]}
          />
        </div>
        <AutosaveText
          multiline
          minRows={2}
          maxHeight={320}
          label={`Sinopsis ${word.one} ${ep.no}`}
          value={ep.synopsis}
          onSave={(synopsis) => save({ synopsis })}
          placeholder={explainer ? `Apa yang dibahas di ${word.one} ini?` : 'Apa yang terjadi di episode ini?'}
          className="w-full rounded-lg border border-transparent bg-transparent px-1 text-sm leading-relaxed text-ink-2 outline-none hover:border-line focus:border-ink focus:bg-surface"
        />
        {/* Later episodes are written from this summary, so it can be corrected here (saved as you type). */}
        {(ep.summary.trim() || ep.clipCount > 0) && (
          <div className="flex flex-col gap-1 rounded-lg bg-sand px-3 pb-2 pt-2" data-episode-summary={ep.no}>
            <span className="flex items-baseline gap-1.5 text-[13px]">
              <span className="font-semibold text-ink">Ringkasan</span>
              <span className="text-xs text-muted">dibaca AI saat menulis {word.one} berikutnya</span>
            </span>
            <AutosaveText
              multiline
              minRows={2}
              maxHeight={240}
              label={`Ringkasan ${word.one} ${ep.no}`}
              value={ep.summary}
              onSave={(summary) => save({ summary })}
              placeholder={explainer ? 'Apa saja yang sudah dibahas di sini?' : 'Apa yang terjadi di episode ini dan bagaimana akhirnya?'}
              className="w-full rounded-md border border-transparent bg-transparent px-1 text-[13px] leading-relaxed text-ink-2 outline-none hover:border-line-2 focus:border-ink focus:bg-surface"
            />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => go({ name: 'project', id: ep.id })}>
            Buka
          </Button>
          <Button size="sm" icon={<Wand2 className="size-4" />} disabled={locked || auto?.state === 'running'} onClick={onRunOne}>
            Sekali klik
          </Button>
          <span className="text-[13px] text-muted">{ep.clipCount ? `${ep.clipCount} adegan · ${mmss(ep.totalMs)}` : explainer ? 'Belum ada adegan' : 'Belum ada naskah'}</span>
        </div>
      </div>
    </article>
  )
}

export function SeriesPage({ id }: { id: string }) {
  const { go, toast } = useApp()
  const [bundle, setBundle] = useState<SeriesBundle | null>(null)
  const [adding, setAdding] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const run = useSeriesAutopilot((s) => s.runs[id])
  const planning = useSeriesAutopilot((s) => !!s.planning[id])
  const episodeRunning = useAutopilot((s) => !!bundle?.episodes.some((e) => s.runs[e.id]?.state === 'running'))
  const running = run?.state === 'running'

  const refresh = useCallback(
    (): Promise<void> =>
      window.api.series
        .get(id)
        .then(setBundle)
        .catch(() => undefined),
    [id]
  )

  useEffect(() => {
    window.api.series
      .get(id)
      .then(setBundle)
      .catch((e) => {
        toast('error', errorText(e))
        go({ name: 'home' })
      })
  }, [id])

  // Episodes change in the background while a plan or a run is going; a slow poll keeps the list current.
  const live = running || planning || episodeRunning
  useEffect(() => {
    if (!live) return
    const timer = setInterval(() => void refresh(), 2500)
    return () => clearInterval(timer)
  }, [live, refresh])
  useEffect(() => {
    void refresh()
  }, [planning, run?.state, run?.done, run?.current?.id])

  if (!bundle)
    return (
      <div className="flex h-full items-center justify-center gap-2 text-ink-2">
        <Spinner />
        Membuka seri…
      </div>
    )

  const { series, episodes, characters } = bundle
  const back = (): void => go({ name: 'settings', back: { name: 'series', id } })
  const started = episodes.some((e) => e.clipCount > 0)
  const busy = running || planning || adding
  const explainer = series.kind === 'explainer'
  const word = episodeWord(series)

  const startAll = async (): Promise<void> => {
    const ready = await servicesReady(series, back)
    if (!ready) return
    let exportAfter = ready.autoExport
    const count = episodes.length ? `${episodes.length} ${word.one}` : `Semua ${word.one}`
    const ok = await confirmDialog({
      title: `Buat semua ${word.one} sekali klik?`,
      body: explainer
        ? `${count} dibuat satu per satu: sekitar ${explainerSceneCount(series.durationSec)} adegan ${getTemplate(series.templateId).name.toLowerCase()} ` +
          `dan narasinya per ${word.one}, lalu tiap ${word.one} terbuka di editor. ` +
          explainerImageText(ready) +
          `${word.title} yang sudah selesai dilewati.`
        : `${count} dibuat satu per satu: naskah, rencana visual, lembar karakter, ` +
          `sekitar ${clipCountFor(series.durationSec)} gambar klip, narasi, dan caption per episode, lalu tiap episode terbuka di editor. ` +
          'Lembar karakter dari episode sebelumnya dipakai ulang. ' +
          imageSourceSentence(ready.imageModel) +
          'Episode yang sudah selesai dilewati.',
      confirm: `Buat semua ${word.one}`,
      option: {
        ...exportOption(exportAfter, (on) => (exportAfter = on)),
        hint: `Satu file per ${word.one} (E01-….mp4) di subfolder seri, di folder ekspor bawaan.`
      }
    })
    if (!ok) return
    void window.api.settings.set({ autoExport: exportAfter })
    startSeriesAutopilot(id, { exportAfter })
  }

  const runOne = async (ep: SeriesEpisode): Promise<void> => {
    const ready = await servicesReady(series, back)
    if (!ready) return
    let exportAfter = ready.autoExport
    const earlier = series.continuity === 'serial' && episodes.some((e) => e.no < ep.no && !e.summary.trim())
    const ok = await confirmDialog({
      title: `Buat ${word.one} ${ep.no} sekali klik?`,
      body: explainer
        ? `Adegan dan narasi ${word.one} ini dibuat otomatis dengan template seri, lalu ${word.one}nya terbuka di editor. ` +
          (earlier ? `Ada ${word.one} sebelumnya yang belum punya adegan, jadi ${word.one} ini disusun dari rencananya saja. ` : '') +
          explainerImageText(ready).trim()
        : 'Naskah, rencana visual, gambar klip, narasi, dan caption episode ini dibuat otomatis memakai pemeran seri, lalu episodenya terbuka di editor. ' +
          (earlier ? 'Ada episode sebelumnya yang belum punya naskah, jadi naskah ini ditulis dari rencananya saja. ' : '') +
          imageSourceSentence(ready.imageModel).trim(),
      confirm: 'Buat otomatis',
      option: { ...exportOption(exportAfter, (on) => (exportAfter = on)), hint: 'Ke subfolder seri di folder ekspor bawaan.' }
    })
    if (!ok) return
    void window.api.settings.set({ autoExport: exportAfter })
    const folder = await seriesExportFolder(series.title)
    void runEpisode(ep, { kind: series.kind, exportAfter, folder, quiet: false }).catch((e) => toast('error', errorText(e)))
    go({ name: 'project', id: ep.id })
  }

  const plan = async (again: boolean): Promise<void> => {
    if (again) {
      const ok = await confirmDialog({
        title: 'Susun ulang rencana seri?',
        body: explainer
          ? `Bible, judul, dan semua rencana ${word.one} diganti dengan yang baru.`
          : 'Bible, judul, dan semua rencana episode diganti dengan yang baru. Pemeran yang sudah punya lembar karakter tetap disimpan.',
        confirm: 'Susun ulang'
      })
      if (!ok) return
    }
    try {
      setBundle(await planSeries(id))
    } catch (e) {
      toast('error', errorText(e))
    }
  }

  const addEpisode = async (): Promise<void> => {
    setAdding(true)
    try {
      setBundle(await window.api.series.addEpisode(id))
    } catch (e) {
      toast('error', errorText(e))
    } finally {
      setAdding(false)
    }
  }

  const removeSeries = async (): Promise<void> => {
    if (running || episodeRunning) return toast('error', 'Hentikan dulu pembuatan otomatis di seri ini.')
    const ok = await confirmDialog({
      title: 'Hapus seri?',
      body: `“${series.title}” beserta ${episodes.length} ${word.one}, semua gambar, video, suara${explainer ? '' : ', dan lembar karakternya'} akan dihapus dari komputer ini. Tindakan ini tidak bisa dibatalkan.`,
      confirm: 'Hapus seri',
      danger: true
    })
    if (!ok) return
    try {
      await window.api.series.remove(id)
      dismissSeriesAutopilot(id)
      go({ name: 'home' })
    } catch (e) {
      toast('error', errorText(e))
    }
  }

  const removeEpisode = async (ep: SeriesEpisode): Promise<void> => {
    if (useAutopilot.getState().runs[ep.id]?.state === 'running') return toast('error', `Hentikan dulu pembuatan otomatis ${word.one} ini.`)
    const ok = await confirmDialog({
      title: `Hapus ${word.one} ${ep.no}?`,
      body: `“${stripEpisodeTag(ep.title)}” beserta gambar, video, dan suaranya dihapus. ${word.title} sesudahnya maju satu nomor.`,
      confirm: `Hapus ${word.one}`,
      danger: true
    })
    if (!ok) return
    try {
      await window.api.series.removeEpisode(ep.id)
      await refresh()
    } catch (e) {
      toast('error', errorText(e))
    }
  }

  return (
    <div className="flex h-full flex-col">
      <SeriesHeader
        series={series}
        episodes={episodes.length}
        running={running}
        busy={busy || episodeRunning}
        stopping={!!run?.stopping}
        onRename={(title) => void window.api.series.update(id, { title }).then(() => refresh())}
        onRemove={() => void removeSeries()}
        onStart={() => void startAll()}
        onStop={() => void stopSeriesAutopilot(id)}
        onSettings={() => setSettingsOpen(true)}
      />
      {settingsOpen && <SeriesSettingsModal bundle={bundle} onClose={() => setSettingsOpen(false)} onChange={setBundle} />}
      <main className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-[1240px] grid-cols-[minmax(0,1fr)_minmax(0,380px)] items-start gap-6 px-8 py-8">
          <section className="flex min-w-0 flex-col gap-4">
            {run && <RunCard run={run} bundle={bundle} />}

            <div className="flex items-end gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-[27px] font-bold tracking-[-0.015em]">{word.title}</h2>
                <p className="mt-1 text-[13px] text-ink-2">
                  {explainer
                    ? series.continuity === 'serial'
                      ? 'Berurutan seperti kursus: setiap pelajaran melanjutkan pelajaran sebelumnya, jadi adegannya disusun berurutan.'
                      : 'Lepas: setiap episode membahas hal berbeda dengan tema dan template yang sama.'
                    : series.continuity === 'serial'
                      ? 'Bersambung: setiap episode melanjutkan cerita sebelumnya, jadi naskahnya ditulis berurutan.'
                      : 'Antologi: setiap episode cerita lepas dengan dunia dan pemeran yang sama.'}
                </p>
              </div>
              {episodes.length > 0 && !started && (
                <Button size="sm" icon={<RefreshCw className="size-4" />} disabled={busy} loading={planning && !running} onClick={() => void plan(true)}>
                  Susun ulang rencana
                </Button>
              )}
            </div>

            {planning && !run && (
              <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-5 py-4 text-sm text-ink-2" data-series-planning>
                <Spinner className="size-5" />
                {explainer ? `Menyusun bible dan rencana tiap ${word.one}…` : 'Menyusun bible, pemeran, dan rencana tiap episode…'}
              </div>
            )}

            {!episodes.length && !planning && !running && (
              <div className="flex flex-col items-start gap-3 rounded-2xl border-[1.5px] border-dashed border-line-3 px-6 py-6">
                <p className="text-[15px] font-semibold">Rencana seri belum ada</p>
                <p className="text-sm text-ink-2">
                  {explainer
                    ? `AI menyusun bible dan rencana ${series.episodeCount} ${word.one} dari topikmu.`
                    : `AI menyusun bible, pemeran tetap, dan rencana ${series.episodeCount} episode dari premismu.`}
                </p>
                <Button variant="primary" icon={<Layers className="size-4" />} onClick={() => void plan(false)}>
                  Susun seri
                </Button>
              </div>
            )}

            {episodes.map((ep) => (
              <EpisodeRow
                key={ep.id}
                ep={ep}
                series={series}
                locked={busy}
                current={run?.current?.id === ep.id}
                onChanged={() => void refresh()}
                onRunOne={() => void runOne(ep)}
                onRemove={() => void removeEpisode(ep)}
              />
            ))}

            {episodes.length > 0 && (
              <button
                type="button"
                disabled={busy || episodes.length >= MAX_EPISODES}
                onClick={() => void addEpisode()}
                className="flex h-12 items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-line-3 text-sm font-medium text-ink-2 enabled:hover:border-ink-2 enabled:hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
              >
                {adding ? <Spinner /> : <Plus className="size-4" />}
                {adding
                  ? `Menyusun ${word.one} berikutnya…`
                  : episodes.length >= MAX_EPISODES
                    ? `Maksimal ${MAX_EPISODES} ${word.one}`
                    : `Tambah ${word.one}`}
              </button>
            )}
          </section>

          <aside className="flex min-w-0 flex-col gap-4">
            <BiblePanel series={series} onChange={(s) => setBundle((b) => (b ? { ...b, series: s } : b))} />
            {/* An explainer series has no recurring characters. */}
            {!explainer && <CastPanel characters={characters} onChange={() => void refresh()} />}
          </aside>
        </div>
      </main>
    </div>
  )
}
