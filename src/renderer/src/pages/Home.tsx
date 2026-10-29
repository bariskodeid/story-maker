import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, Copy, FolderOpen, Layers, MoreHorizontal, Plus, Search, SlidersHorizontal, Trash2, Wand2 } from 'lucide-react'
import { explainerSceneCount, getTemplate, type ExplainerTemplateId } from '@shared/explainer'
import { isNineRouterImage } from '@shared/imageModels'
import { DURATIONS, LANGUAGES, clipCountFor, llmName } from '@shared/models'
import { MAX_EPISODES, MIN_EPISODES } from '@shared/series'
import { getStyle } from '@shared/styles'
import type {
  ApiProvider,
  AppSettings,
  AspectRatio,
  KeyStatus,
  ProjectKind,
  ProjectStatus,
  ProjectSummary,
  SeriesContinuity,
  SeriesSummary,
  TtsProvider
} from '@shared/types'
import { TemplatePicker, TemplateSwatch } from '../components/ExplainerPreview'
import { Logo } from '../components/Logo'
import { Select, type SelectOption } from '../components/Select'
import { StyleSwatch } from '../components/StyleArt'
import { StyleMenu } from '../components/StyleMenu'
import { Badge, Button, Chip, IconButton, Menu, Segmented, confirmDialog, cx } from '../components/ui'
import { exportOption, startAutopilot, useAutopilot } from '../lib/autopilot'
import { dismissSeriesAutopilot, planSeries, startSeriesAutopilot, useSeriesAutopilot } from '../lib/seriesAutopilot'
import { errorText, joinList, mmss, relativeTime } from '../lib/format'
import { TTS_NAMES, TTS_PROVIDERS, missingServices, ttsReadiness, usableTts } from '../lib/keys'
import { useApp } from '../store/app'

const STATUS: Record<ProjectStatus, { label: string; tone: 'draft' | 'info' | 'warn' | 'ok' }> = {
  draft: { label: 'Draf', tone: 'draft' },
  script: { label: 'Naskah', tone: 'info' },
  storyboard: { label: 'Storyboard', tone: 'info' },
  editing: { label: 'Editing', tone: 'warn' },
  exported: { label: 'Diekspor', tone: 'ok' }
}

/** Status filters apply to standalone projects; "Seri" shows only series, "Semua" both. */
const FILTERS: { id: 'all' | 'draft' | 'progress' | 'exported' | 'series'; label: string; match: (s: ProjectStatus) => boolean }[] = [
  { id: 'all', label: 'Semua', match: () => true },
  { id: 'draft', label: 'Draf', match: (s) => s === 'draft' },
  { id: 'progress', label: 'Dalam proses', match: (s) => s === 'script' || s === 'storyboard' || s === 'editing' },
  { id: 'exported', label: 'Diekspor', match: (s) => s === 'exported' },
  { id: 'series', label: 'Seri', match: () => false }
]

const CONTINUITY: SelectOption<SeriesContinuity>[] = [
  { value: 'serial', label: 'Bersambung', note: 'Satu alur cerita berlanjut dari episode ke episode' },
  { value: 'anthology', label: 'Antologi', note: 'Cerita lepas dengan dunia dan pemeran yang sama' }
]

const EPISODE_COUNTS: SelectOption<number>[] = Array.from({ length: MAX_EPISODES - MIN_EPISODES + 1 }, (_, i) => ({
  value: MIN_EPISODES + i,
  label: `${MIN_EPISODES + i} episode`
}))

type Card = { kind: 'project'; p: ProjectSummary; at: number } | { kind: 'series'; s: SeriesSummary; at: number }

const SUGGESTIONS = [
  'Asal-usul Sumpah Palapa dan bagaimana Gajah Mada menepatinya',
  'Misteri Segitiga Bermuda: fakta dan mitosnya',
  'Kenapa kucing suka masuk ke dalam kotak?'
]

const EXPLAINER_SUGGESTIONS = [
  'Cara membuat repositori Git pertama untuk pemula',
  '5 trik supaya tetap fokus saat kerja dari rumah',
  'Fakta mengejutkan tentang matahari'
]

const ASPECTS: SelectOption<AspectRatio>[] = [
  { value: '16:9', label: '16:9 · YouTube', icon: <span className="block h-[10px] w-[17px] rounded-[2px] border-[1.5px] border-ink" /> },
  { value: '9:16', label: '9:16 · Shorts', icon: <span className="mx-[3px] block h-[16px] w-[10px] rounded-[2px] border-[1.5px] border-ink" /> }
]

export function Home() {
  const { go, toast } = useApp()
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)
  const [seriesList, setSeriesList] = useState<SeriesSummary[]>([])
  const [mode, setMode] = useState<'single' | 'series'>('single')
  const [episodeCount, setEpisodeCount] = useState(3)
  const [continuity, setContinuity] = useState<SeriesContinuity>('serial')
  const [keys, setKeys] = useState<KeyStatus[]>([])
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all')
  const [query, setQuery] = useState('')
  const [synopsis, setSynopsis] = useState('')
  const [durationSec, setDurationSec] = useState(60)
  const [language, setLanguage] = useState('id')
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9')
  const [styleId, setStyleId] = useState('stickman')
  const [tts, setTts] = useState<TtsProvider>('gemini')
  const [creating, setCreating] = useState<'manual' | 'auto' | null>(null)
  const [kind, setKind] = useState<ProjectKind>('story')
  const [templateId, setTemplateId] = useState<ExplainerTemplateId>('tutorial')
  const explainer = kind === 'explainer'
  const autopilots = useAutopilot((s) => s.runs)
  const seriesRuns = useSeriesAutopilot((s) => s.runs)
  const seriesPlanning = useSeriesAutopilot((s) => s.planning)

  const refresh = (): void => {
    window.api.projects
      .list()
      .then(setProjects)
      .catch((e) => toast('error', errorText(e)))
    window.api.series
      .list()
      .then(setSeriesList)
      .catch((e) => toast('error', errorText(e)))
  }

  useEffect(() => {
    refresh()
    void window.api.settings.keys().then(setKeys)
    void window.api.settings.get().then((s) => {
      setAppSettings(s)
      setTts(s.defaultTtsProvider)
      setLanguage(s.defaultLanguage)
    })
  }, [])

  // Start on a narrator service that has a working key.
  useEffect(() => {
    if (appSettings && keys.length) setTts(usableTts(appSettings.defaultTtsProvider, keys))
  }, [appSettings, keys])

  const ttsOptions = useMemo((): SelectOption<TtsProvider>[] => {
    const ready = ttsReadiness(keys)
    return TTS_PROVIDERS.map((p) => {
      const blocked = keys.length > 0 && !ready[p].ok
      return { value: p, label: TTS_NAMES[p], disabled: blocked, note: blocked ? `${ready[p].reason}. Atur di Pengaturan.` : undefined }
    })
  }, [keys])

  const setupIssues = useMemo(() => {
    if (!appSettings || !keys.length) return []
    // A key counts once it is saved and did not fail its last check.
    const ok = (p: ApiProvider): boolean => {
      const k = keys.find((x) => x.provider === p)
      return !!k?.configured && k.lastOk !== false
    }
    const issues: { what: string; blocks: string }[] = []
    // With images drawn through 9Router, Higgsfield is only needed for the optional AI videos.
    const imagesViaNineRouter = isNineRouterImage(appSettings.imageModel) && ok('ninerouter')
    if (!ok('higgsfield') && !imagesViaNineRouter) issues.push({ what: 'kunci Higgsfield', blocks: 'gambar' })
    const llm = appSettings.llmProvider
    if (!ok(llm)) issues.push({ what: `kunci ${llmName(llm)}`, blocks: 'cerita' })
    else if (!appSettings.llmModels[llm]) issues.push({ what: `model ${llmName(llm)}`, blocks: 'cerita' })
    // Narration needs just one working voice service; every project can pick any of them.
    const tts = ttsReadiness(keys)
    if (!TTS_PROVIDERS.some((p) => tts[p].ok)) issues.push({ what: 'kunci Gemini, ElevenLabs, atau 9Router', blocks: 'suara narator' })
    return issues
  }, [keys, appSettings])

  const visible = useMemo((): Card[] => {
    const f = FILTERS.find((x) => x.id === filter)!
    const q = query.trim().toLowerCase()
    const hit = (title: string): boolean => !q || title.toLowerCase().includes(q)
    const series: Card[] =
      filter === 'all' || filter === 'series' ? seriesList.filter((s) => hit(s.title)).map((s) => ({ kind: 'series', s, at: s.updatedAt })) : []
    const singles: Card[] = (projects ?? []).filter((p) => f.match(p.status) && hit(p.title)).map((p) => ({ kind: 'project', p, at: p.updatedAt }))
    return [...series, ...singles].sort((a, b) => b.at - a.at)
  }, [projects, seriesList, filter, query])

  const countFor = (id: (typeof FILTERS)[number]['id']): number => {
    if (id === 'series') return seriesList.length
    const f = FILTERS.find((x) => x.id === id)!
    return (projects ?? []).filter((p) => f.match(p.status)).length + (id === 'all' ? seriesList.length : 0)
  }

  const start = async (auto: boolean, exportAfter = false): Promise<void> => {
    setCreating(auto ? 'auto' : 'manual')
    try {
      const b = await window.api.projects.create({ synopsis, durationSec, language, aspectRatio, styleId, ttsProvider: tts, kind, templateId })
      if (auto) startAutopilot(b.project.id, { exportAfter })
      go({ name: 'project', id: b.project.id })
    } catch (e) {
      toast('error', errorText(e))
      setCreating(null)
    }
  }

  // One-click generate needs every service up front; the manual flow can still start and fix keys later.
  // Explainer scenes work without pictures, so one-click only needs the writer and the narrator.
  const autoMissing =
    appSettings && keys.length ? missingServices(appSettings, keys, { story: true, imageModel: explainer ? null : appSettings.imageModel, tts }) : []
  const autoBlocked = !synopsis.trim()
    ? mode === 'series'
      ? 'Tulis premis serinya dulu.'
      : 'Tulis ide ceritanya dulu.'
    : autoMissing.length
      ? `Atur dulu ${joinList(autoMissing)} di Pengaturan, atau pilih suara narator lain.`
      : null

  const startAuto = async (): Promise<void> => {
    const viaNineRouter = isNineRouterImage(appSettings?.imageModel ?? '')
    let exportAfter = appSettings?.autoExport ?? false
    const imagesReady = !!appSettings && missingServices(appSettings, keys, { story: false, imageModel: appSettings.imageModel, tts: null }).length === 0
    const ok = await confirmDialog({
      title: 'Buat video sekali klik?',
      body: explainer
        ? `Sekitar ${explainerSceneCount(durationSec)} adegan ${getTemplate(templateId).name.toLowerCase()} dan narasinya dibuat otomatis, lalu proyeknya terbuka di editor. ` +
          (imagesReady
            ? `Gambar AI hanya dibuat untuk adegan yang membutuhkannya${viaNineRouter ? ' (lewat 9Router)' : ' (memakai kredit Higgsfield)'}. `
            : 'Layanan gambar belum diatur, jadi adegan tampil tanpa gambar AI. ') +
          'Screenshot untuk tutorial bisa kamu tambahkan sendiri di langkah Adegan.'
        :
        `Naskah, rencana visual, lembar karakter, sekitar ${clipCountFor(durationSec)} gambar klip, narasi, dan caption dibuat otomatis, ` +
        `lalu proyeknya terbuka di editor. ` +
        (viaNineRouter ? 'Gambar dibuat lewat 9Router. ' : 'Gambar dibuat lewat Higgsfield dan memakai kredit. ') +
        'Video AI tidak dibuat; klip memakai gerak kamera.',
      confirm: 'Buat otomatis',
      option: exportOption(exportAfter, (on) => (exportAfter = on))
    })
    if (!ok) return
    void window.api.settings.set({ autoExport: exportAfter }).then(setAppSettings)
    await start(true, exportAfter)
  }

  /** Creates a series and opens its page; the plan (and with `auto` every episode) is made there in the background. */
  const startSeries = async (auto: boolean, exportAfter = false): Promise<void> => {
    setCreating(auto ? 'auto' : 'manual')
    try {
      const series = await window.api.series.create({
        premise: synopsis,
        continuity,
        episodeCount,
        durationSec,
        language,
        aspectRatio,
        styleId,
        ttsProvider: tts
      })
      if (auto) startSeriesAutopilot(series.id, { exportAfter })
      else void planSeries(series.id).catch((e) => toast('error', errorText(e)))
      go({ name: 'series', id: series.id })
    } catch (e) {
      toast('error', errorText(e))
      setCreating(null)
    }
  }

  const startSeriesAuto = async (): Promise<void> => {
    const viaNineRouter = isNineRouterImage(appSettings?.imageModel ?? '')
    let exportAfter = appSettings?.autoExport ?? false
    const ok = await confirmDialog({
      title: `Buat ${episodeCount} episode sekali klik?`,
      body:
        `AI menyusun bible seri, pemeran tetap, dan rencana ${episodeCount} episode, lalu membuat episodenya satu per satu: naskah, ` +
        `rencana visual, sekitar ${clipCountFor(durationSec)} gambar klip, narasi, dan caption per episode. Lembar karakter dibuat sekali dan ` +
        'dipakai ulang di semua episode. ' +
        (viaNineRouter ? 'Gambar dibuat lewat 9Router. ' : 'Gambar dibuat lewat Higgsfield dan memakai kredit. ') +
        'Video AI tidak dibuat.',
      confirm: 'Buat semua episode',
      option: {
        ...exportOption(exportAfter, (on) => (exportAfter = on)),
        hint: 'Satu file per episode (E01-….mp4) di subfolder seri, di folder ekspor bawaan.'
      }
    })
    if (!ok) return
    void window.api.settings.set({ autoExport: exportAfter }).then(setAppSettings)
    await startSeries(true, exportAfter)
  }

  const removeSeries = async (s: SeriesSummary): Promise<void> => {
    if (seriesRuns[s.id]?.state === 'running' || seriesPlanning[s.id]) return toast('error', 'Hentikan dulu pembuatan otomatis seri ini.')
    const ok = await confirmDialog({
      title: 'Hapus seri?',
      body: `“${s.title}” beserta ${s.episodeCount} episode, semua gambar, video, suara, dan lembar karakternya akan dihapus dari komputer ini. Tindakan ini tidak bisa dibatalkan.`,
      confirm: 'Hapus seri',
      danger: true
    })
    if (!ok) return
    try {
      await window.api.series.remove(s.id)
      dismissSeriesAutopilot(s.id)
    } catch (e) {
      toast('error', errorText(e))
    }
    refresh()
  }

  const suggestions = explainer ? EXPLAINER_SUGGESTIONS : SUGGESTIONS

  const remove = async (p: ProjectSummary): Promise<void> => {
    const ok = await confirmDialog({
      title: 'Hapus proyek?',
      body: `“${p.title}” beserta semua gambar, video, dan suaranya akan dihapus dari komputer ini. Tindakan ini tidak bisa dibatalkan.`,
      confirm: 'Hapus proyek',
      danger: true
    })
    if (!ok) return
    await window.api.projects.remove(p.id)
    refresh()
  }

  const duplicate = async (p: ProjectSummary): Promise<void> => {
    try {
      await window.api.projects.duplicate(p.id)
      refresh()
    } catch (e) {
      toast('error', errorText(e))
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-[68px] shrink-0 items-center gap-6 border-b border-line bg-surface px-8">
        <Logo />
        <label className="flex h-10 w-[360px] items-center gap-2 rounded-full border border-line bg-sand px-3.5 text-muted">
          <Search className="size-[18px]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari proyek"
            aria-label="Cari proyek"
            className="flex-1 bg-transparent text-sm text-ink outline-none"
          />
        </label>
        <div className="flex-1" />
        <Button icon={<SlidersHorizontal className="size-[18px]" />} onClick={() => go({ name: 'settings', back: { name: 'home' } })}>
          Pengaturan
          {setupIssues.length > 0 && <span className="size-2 rounded-full bg-accent" />}
        </Button>
      </header>

      <main className="scroll-thin flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-5 px-12 pt-11">
          {setupIssues.length > 0 && (
            <div className="flex items-center gap-3 rounded-2xl border border-sun bg-sun-soft px-4 py-3 text-sm text-sun-ink">
              <AlertTriangle className="size-[18px] shrink-0" />
              <span className="flex-1">
                Sebelum mulai, atur dulu {joinList(setupIssues.map((i) => i.what))} di Pengaturan. Tanpa itu,{' '}
                {joinList([...new Set(setupIssues.map((i) => i.blocks))])} belum bisa dibuat.
              </span>
              <Button size="sm" variant="secondary" onClick={() => go({ name: 'settings', back: { name: 'home' } })}>
                Atur sekarang
              </Button>
            </div>
          )}
          <div>
            <h1 className="font-display text-[46px] font-bold leading-[1.08] tracking-[-0.025em]">Mau bikin video apa hari ini?</h1>
            <p className="mt-3 text-[17px] text-ink-2">
              Tulis idenya. AI menyusun klip, naskah, dan suaranya, lalu kamu tinggal merapikan di editor.
            </p>
          </div>
          <div className="flex flex-col gap-3 rounded-[18px] border-[1.5px] border-ink bg-surface py-5 pl-6 pr-5 shadow-ink-lg">
            <div className="flex items-center gap-3">
              <label htmlFor="ide" className="flex-1 text-[13px] font-semibold text-ink-2">
                {explainer ? 'Topik video penjelasan' : mode === 'series' ? 'Premis seri' : 'Ide cerita atau sinopsis'}
              </label>
              <Segmented<ProjectKind>
                size="sm"
                value={kind}
                onChange={(k) => {
                  setKind(k)
                  // Series are made of story episodes for now.
                  if (k === 'explainer') setMode('single')
                }}
                options={[
                  { id: 'story', label: 'Cerita' },
                  { id: 'explainer', label: 'Video penjelasan' }
                ]}
              />
              {!explainer && (
                <Segmented
                  size="sm"
                  value={mode}
                  onChange={setMode}
                  options={[
                    { id: 'single', label: 'Satu video' },
                    { id: 'series', label: 'Seri', title: 'Beberapa episode dengan dunia dan pemeran yang sama' }
                  ]}
                />
              )}
            </div>
            <textarea
              id="ide"
              rows={3}
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value)}
              placeholder={
                explainer
                  ? 'Contoh: cara membuat repositori Git pertama dan menyimpan perubahan kode, untuk pemula…'
                  : mode === 'series'
                    ? 'Contoh: Si Kancil yang cerdik tinggal di hutan Jawa. Setiap kali hewan lain dalam bahaya, dia memakai akalnya, tapi suatu hari dia bertemu lawan yang sama cerdiknya…'
                  : 'Contoh: Gajah Mada bersumpah tidak akan menikmati palapa sebelum Nusantara bersatu. Para menteri menertawakannya, tapi dia membuktikannya…'
              }
              className="resize-none bg-transparent text-lg leading-relaxed outline-none placeholder:text-muted/70"
            />
            <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-line pt-3.5">
              {mode === 'series' && (
                <>
                  <Select variant="pill" label="Jumlah episode" value={episodeCount} onChange={setEpisodeCount} options={EPISODE_COUNTS} menuWidth={180} />
                  <Select variant="pill" label="Alur seri" value={continuity} onChange={setContinuity} options={CONTINUITY} menuWidth={300} />
                </>
              )}
              <Select
                variant="pill"
                label={mode === 'series' ? 'Durasi per episode' : 'Durasi'}
                value={durationSec}
                onChange={setDurationSec}
                options={DURATIONS.map((d) => ({ value: d.sec, label: mode === 'series' ? `${d.label} / episode` : d.label }))}
              />
              <Select
                variant="pill"
                label="Bahasa"
                value={language}
                onChange={setLanguage}
                options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
                menuWidth={200}
              />
              <Select variant="pill" label="Format" value={aspectRatio} onChange={setAspectRatio} options={ASPECTS} menuWidth={200} />
              {!explainer && <StyleMenu value={styleId} onChange={setStyleId} />}
              <Select variant="pill" label="Suara narator" value={tts} onChange={setTts} options={ttsOptions} menuWidth={280} />
              <div className="flex-1" />
              <span title={autoBlocked ?? undefined}>
                <Button
                  size="lg"
                  icon={<Wand2 className="size-[18px]" />}
                  disabled={!!autoBlocked || creating !== null}
                  loading={creating === 'auto'}
                  onClick={() => void (mode === 'series' ? startSeriesAuto() : startAuto())}
                >
                  {mode === 'series' ? 'Sekali klik semua' : 'Sekali klik'}
                </Button>
              </span>
              {mode === 'series' ? (
                <span title={!synopsis.trim() ? 'Tulis premis serinya dulu.' : undefined}>
                  <Button
                    variant="primary"
                    size="lg"
                    icon={<Layers className="size-[18px]" />}
                    disabled={!synopsis.trim() || creating !== null}
                    loading={creating === 'manual'}
                    onClick={() => void startSeries(false)}
                  >
                    Susun seri
                  </Button>
                </span>
              ) : (
                <Button variant="primary" size="lg" disabled={creating !== null} loading={creating === 'manual'} onClick={() => void start(false)}>
                  Mulai
                  <ArrowRight className="size-[18px]" />
                </Button>
              )}
            </div>
          </div>
          {explainer && <TemplatePicker value={templateId} onChange={setTemplateId} />}
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
            <span>Coba ide ini:</span>
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSynopsis(s)}
                className="h-9 rounded-full border border-dashed border-line-3 px-3.5 text-[13px] text-ink-2 hover:border-ink-2 hover:text-ink"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <section className="mx-auto flex max-w-[1280px] flex-col gap-[18px] px-12 pb-12 pt-11">
          <div className="flex items-center gap-4">
            <h2 className="font-display text-[27px] font-bold tracking-[-0.015em]">Proyek kamu</h2>
            <div className="ml-2 flex gap-1.5">
              {FILTERS.map((f) => {
                const count = countFor(f.id)
                return (
                  <Chip key={f.id} on={filter === f.id} onClick={() => setFilter(f.id)}>
                    {f.label}
                    <span className={cx('text-xs', filter === f.id ? 'text-line-2' : 'text-muted')}>{count}</span>
                  </Chip>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-5">
            {filter === 'series' ? (
              <button
                type="button"
                onClick={() => {
                  // A series needs a premise first, so this goes to the composer instead of creating anything.
                  setKind('story')
                  setMode('series')
                  const field = document.getElementById('ide')
                  field?.scrollIntoView({ block: 'center', behavior: 'smooth' })
                  field?.focus()
                }}
                className="flex min-h-[262px] flex-col items-center justify-center gap-2.5 rounded-2xl border-[1.5px] border-dashed border-line-3 text-ink-2 hover:border-ink-2 hover:bg-surface"
              >
                <span className="flex size-[54px] items-center justify-center rounded-full border-[1.5px] border-ink bg-sun text-ink shadow-ink">
                  <Layers className="size-6" strokeWidth={2.2} />
                </span>
                <span className="text-base font-semibold text-ink">Seri baru</span>
                <span className="text-[13px]">Beberapa episode, pemeran yang sama</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void start(false)}
                className="flex min-h-[262px] flex-col items-center justify-center gap-2.5 rounded-2xl border-[1.5px] border-dashed border-line-3 text-ink-2 hover:border-ink-2 hover:bg-surface"
              >
                <span className="flex size-[54px] items-center justify-center rounded-full border-[1.5px] border-ink bg-accent text-white shadow-ink">
                  <Plus className="size-6" strokeWidth={2.2} />
                </span>
                <span className="text-base font-semibold text-ink">Proyek baru</span>
                <span className="text-[13px]">Mulai dari ide atau sinopsis</span>
              </button>
            )}

            {visible.map((card) => {
              if (card.kind === 'series') {
                const s = card.s
                const run = seriesRuns[s.id]
                return (
                  <article key={s.id} data-series-card={s.title} className="relative flex flex-col pt-3">
                    {/* Two sheets behind the card make a series read as a stack of episodes. */}
                    <span aria-hidden className="absolute inset-x-6 top-0 h-8 rounded-t-2xl border border-b-0 border-line-3 bg-line" />
                    <span aria-hidden className="absolute inset-x-3 top-1.5 h-8 rounded-t-2xl border border-b-0 border-line-3 bg-sand" />
                    <div className="relative flex flex-1 flex-col overflow-hidden rounded-2xl border border-ink/70 bg-surface">
                      <button type="button" onClick={() => go({ name: 'series', id: s.id })} className="text-left">
                        <div className="relative aspect-video w-full overflow-hidden border-b border-line">
                          {s.coverUrl ? (
                            <img src={s.coverUrl} alt="" className="size-full object-cover" />
                          ) : (
                            <StyleSwatch styleId={s.styleId} className="size-full" iconSize={40} />
                          )}
                          <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full border border-ink bg-sun px-2.5 py-[3px] text-xs font-semibold">
                            <Layers className="size-3" />
                            Seri · {s.episodeCount} episode
                          </span>
                        </div>
                        <div className="line-clamp-2 min-h-[46px] px-4 pb-0.5 pt-3.5 text-base font-semibold leading-snug">{s.title}</div>
                      </button>
                      <div className="flex items-center gap-2 py-2 pl-4 pr-2">
                        {run?.state === 'running' || seriesPlanning[s.id] ? (
                          <Badge tone="info">Dibuat otomatis…</Badge>
                        ) : (
                          <Badge tone={s.episodeCount > 0 && s.readyCount === s.episodeCount ? 'ok' : s.readyCount > 0 ? 'warn' : 'draft'}>
                            {s.readyCount}/{s.episodeCount} episode siap
                          </Badge>
                        )}
                        <span className="truncate text-[13px] text-muted">{relativeTime(s.updatedAt)}</span>
                        <div className="flex-1" />
                        <Menu
                          trigger={(open) => (
                            <IconButton label="Opsi seri" onClick={open} className="border-transparent" size={36}>
                              <MoreHorizontal className="size-[18px]" />
                            </IconButton>
                          )}
                          items={[
                            { label: 'Buka', icon: <FolderOpen className="size-4" />, run: () => go({ name: 'series', id: s.id }) },
                            { label: 'Hapus', icon: <Trash2 className="size-4" />, danger: true, run: () => void removeSeries(s) }
                          ]}
                        />
                      </div>
                    </div>
                  </article>
                )
              }
              const p = card.p
              const st = STATUS[p.status]
              return (
                <article key={p.id} className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface">
                  <button type="button" onClick={() => go({ name: 'project', id: p.id })} className="text-left">
                    <div className="relative aspect-video w-full overflow-hidden border-b border-line">
                      {p.coverUrl ? (
                        <img src={p.coverUrl} alt="" className="size-full object-cover" />
                      ) : p.kind === 'explainer' ? (
                        <TemplateSwatch templateId={p.templateId} className="size-full" />
                      ) : (
                        <StyleSwatch styleId={p.styleId} className="size-full" iconSize={40} />
                      )}
                      <span className="absolute left-2.5 top-2.5 rounded-full border border-ink bg-surface px-2.5 py-[3px] text-xs font-semibold">
                        {p.kind === 'explainer' ? getTemplate(p.templateId).name : getStyle(p.styleId).name}
                      </span>
                      {p.totalMs > 0 && (
                        <span className="absolute bottom-2.5 right-2.5 rounded-md bg-ink px-2 py-[3px] font-mono text-xs text-paper">
                          {mmss(p.totalMs)}
                        </span>
                      )}
                    </div>
                    <div className="line-clamp-2 min-h-[46px] px-4 pb-0.5 pt-3.5 text-base font-semibold leading-snug">{p.title}</div>
                  </button>
                  <div className="flex items-center gap-2 py-2 pl-4 pr-2">
                    {autopilots[p.id]?.state === 'running' ? <Badge tone="info">Dibuat otomatis…</Badge> : <Badge tone={st.tone}>{st.label}</Badge>}
                    <span className="truncate text-[13px] text-muted">{relativeTime(p.updatedAt)}</span>
                    <div className="flex-1" />
                    <Menu
                      trigger={(open) => (
                        <IconButton label="Opsi proyek" onClick={open} className="border-transparent" size={36}>
                          <MoreHorizontal className="size-[18px]" />
                        </IconButton>
                      )}
                      items={[
                        { label: 'Buka', icon: <FolderOpen className="size-4" />, run: () => go({ name: 'project', id: p.id }) },
                        { label: 'Duplikat', icon: <Copy className="size-4" />, run: () => void duplicate(p) },
                        { label: 'Hapus', icon: <Trash2 className="size-4" />, danger: true, run: () => void remove(p) }
                      ]}
                    />
                  </div>
                </article>
              )
            })}
          </div>
          {projects && projects.length === 0 && seriesList.length === 0 && (
            <p className="text-sm text-muted">Belum ada proyek. Tulis ide di atas lalu klik Mulai.</p>
          )}
        </section>
      </main>
    </div>
  )
}
