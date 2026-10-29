import { useState, type ReactNode } from 'react'
import { AlertTriangle, Check, ImageIcon, Wand2 } from 'lucide-react'
import { wantsAiImage } from '@shared/explainer'
import { isNineRouterImage } from '@shared/imageModels'
import { Button, IconButton, Progress, Spinner, Switch, confirmDialog, cx } from '../../components/ui'
import {
  dismissAutopilot,
  exportOption,
  remainingWork,
  setAutoExport,
  startAutopilot,
  stopAutopilot,
  type AutopilotRun,
  type AutopilotStage
} from '../../lib/autopilot'
import { joinList } from '../../lib/format'
import { missingServices } from '../../lib/keys'
import { useApp } from '../../store/app'
import { useProject } from '../../store/project'

type RowState = 'pending' | 'active' | 'done' | 'failed'

const ORDER: AutopilotStage[] = ['script', 'visuals', 'media', 'finish', 'export']

function stageState(run: AutopilotRun, stage: AutopilotStage): RowState {
  const at = ORDER.indexOf(run.stage)
  const me = ORDER.indexOf(stage)
  if (me < at) return 'done'
  if (me > at) return 'pending'
  // A run the user stopped is paused, not broken.
  return run.state === 'running' ? 'active' : run.state === 'failed' ? 'failed' : 'pending'
}

function Row({ state, title, detail, children }: { state: RowState; title: string; detail: ReactNode; children?: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        className={cx(
          'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border text-xs',
          state === 'done' && 'border-ok-ink/30 bg-ok-soft text-ok-ink',
          state === 'active' && 'border-ink bg-sun-soft text-ink',
          state === 'failed' && 'border-bad-ink/40 bg-bad-soft text-bad-ink',
          state === 'pending' && 'border-line-2 bg-surface text-muted'
        )}
      >
        {state === 'done' ? (
          <Check className="size-[15px]" strokeWidth={3} />
        ) : state === 'active' ? (
          <Spinner className="size-[15px]" />
        ) : state === 'failed' ? (
          <AlertTriangle className="size-[14px]" />
        ) : (
          <span className="size-1.5 rounded-full bg-line-3" />
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className={cx('text-[15px] font-semibold', state === 'pending' ? 'text-muted' : 'text-ink')}>{title}</span>
          <span className="text-[13px] text-ink-2">{detail}</span>
        </div>
        {children}
      </div>
    </li>
  )
}

/** Progress of one-click generate in place of the step pages, so nobody edits a project that is being rewritten. */
export function AutopilotPanel({ run }: { run: AutopilotRun }) {
  const { project, clips, characters, assets } = useProject()
  if (!project) return null

  const jobs = Object.values(run.jobs).sort((a, b) => a.createdAt - b.createdAt)
  // A resumed run makes new sheet jobs; only the latest one per character counts.
  const sheetJobs = [...new Map(jobs.filter((j) => j.kind === 'sheet').map((j) => [j.characterId ?? j.id, j])).values()]
  const narration = jobs.filter((j) => j.kind === 'narration').sort((a, b) => b.createdAt - a.createdAt)[0]
  const exportJob = jobs.filter((j) => j.kind === 'export').at(-1)
  const explainer = project.kind === 'explainer'
  // Explainer scenes only get a picture when they ask for an AI one.
  const pictured = explainer ? clips.filter((c) => wantsAiImage(c.scene)) : clips
  const withImage = pictured.filter((c) => c.imageAssetId).length
  const toVoice = clips.filter((c) => c.narration.trim())
  const voiced = toVoice.filter((c) => c.audioAssetId).length
  const media = stageState(run, 'media')
  const imagesDone = pictured.length > 0 && withImage === pictured.length
  const voicesDone = toVoice.length > 0 && voiced === toVoice.length
  const portrait = project.aspectRatio === '9:16'

  const mediaRow = (done: boolean): RowState => (media === 'active' || media === 'failed' ? (done ? 'done' : media) : media)

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[760px] flex-col gap-6 px-6 py-10">
        <div className="flex items-start gap-3.5">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border-[1.5px] border-ink bg-accent text-white shadow-ink">
            <Wand2 className="size-5" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="font-display text-[26px] font-bold leading-tight">
              {run.state === 'running' ? 'Membuat video otomatis' : run.state === 'stopped' ? 'Pembuatan otomatis dihentikan' : 'Pembuatan otomatis terhenti'}
            </h1>
            <p className="line-clamp-2 text-sm text-ink-2">{project.synopsis}</p>
          </div>
        </div>

        <ol className="flex flex-col gap-4 rounded-2xl border border-line bg-surface px-5 py-5">
          <Row
            state={stageState(run, 'script')}
            title={explainer ? 'Adegan' : 'Naskah'}
            detail={clips.length ? `${clips.length} adegan` : explainer ? 'Menulis teks layar dan narasi tiap adegan' : 'Menyusun adegan dan narasi'}
          />
          {!explainer && (
            <Row
              state={stageState(run, 'visuals')}
              title="Rencana visual"
              detail={characters.length ? `${characters.length} pemeran, prompt gambar, dan gerak kamera` : 'Prompt gambar, pemeran, dan gerak kamera'}
            />
          )}
          {(!explainer || pictured.length > 0) && (
          <Row
            state={mediaRow(imagesDone)}
            title="Gambar"
            detail={
              <>
                {pictured.length ? `${withImage}/${pictured.length} ${explainer ? 'gambar AI' : 'gambar klip'}` : 'Gambar klip'}
                {sheetJobs.length > 0 && ` · ${sheetJobs.filter((j) => j.status === 'done').length}/${sheetJobs.length} lembar karakter`}
              </>
            }
          >
            {pictured.length > 0 && media !== 'pending' && (
              <div className={cx('grid gap-1.5', portrait && !explainer ? 'grid-cols-8' : 'grid-cols-6')}>
                {pictured.map((c, i) => {
                  const url = c.imageAssetId ? assets[c.imageAssetId]?.url : null
                  return (
                    <div
                      key={c.id}
                      className={cx('relative overflow-hidden rounded-md border border-line bg-sand', portrait && !explainer ? 'aspect-[9/16]' : 'aspect-video')}
                      title={c.title}
                    >
                      {url ? (
                        <img src={url} alt="" className="size-full object-cover" />
                      ) : (
                        <span className="absolute inset-0 flex items-center justify-center text-muted">
                          <ImageIcon className="size-4" />
                        </span>
                      )}
                      <span className="absolute left-1 top-1 rounded bg-ink/70 px-1 font-mono text-[10px] text-paper">{i + 1}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </Row>
          )}
          <Row
            state={mediaRow(voicesDone)}
            title="Narasi dan caption"
            detail={
              narration && narration.status === 'running' && narration.message
                ? narration.message
                : toVoice.length && media !== 'pending'
                  ? `${voiced}/${toVoice.length} klip bersuara`
                  : 'Suara narator, lalu caption disamakan dengan suaranya'
            }
          >
            {narration?.status === 'running' && <Progress value={narration.progress} className="max-w-[320px]" />}
          </Row>
          <Row state={stageState(run, 'finish')} title="Editor" detail={run.exportAfter ? 'Proyek dipindah ke editor' : 'Siap kamu cek dan ekspor'} />
          {run.exportAfter && (
            <Row
              state={stageState(run, 'export')}
              title="Ekspor MP4"
              detail={exportJob?.status === 'running' ? (exportJob.message ?? 'Menyiapkan…') : run.exportTarget ? 'Ke folder seri' : 'Ke folder ekspor bawaan'}
            >
              {exportJob?.status === 'running' && <Progress value={exportJob.progress} className="max-w-[320px]" />}
            </Row>
          )}
        </ol>

        {run.state === 'failed' && run.error && (
          <p className="flex items-start gap-2 rounded-xl border border-bad-ink/30 bg-bad-soft px-4 py-3 text-sm text-bad-ink">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {run.error}
          </p>
        )}

        {run.state === 'running' && run.stage !== 'export' && (
          <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
            <Switch on={run.exportAfter} label="Ekspor MP4 otomatis setelah selesai" onChange={(on) => setAutoExport(run.projectId, on)} />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-ink">Ekspor MP4 otomatis setelah selesai</span>
              <span className="text-[13px] text-ink-2">Ke folder ekspor bawaan, dengan pilihan bawaan dialog Ekspor. Bisa diubah selama proses berjalan.</span>
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2.5">
          {run.state === 'running' ? (
            <>
              <Button loading={run.stopping} onClick={() => void stopAutopilot(run.projectId)}>
                Hentikan
              </Button>
              <span className="text-[13px] text-muted">Kamu boleh kembali ke beranda. Prosesnya tetap berjalan selama aplikasi terbuka.</span>
            </>
          ) : (
            <>
              <Button variant="primary" icon={<Wand2 className="size-[17px]" />} onClick={() => startAutopilot(run.projectId)}>
                {run.state === 'stopped' ? 'Lanjutkan otomatis' : 'Coba lagi'}
              </Button>
              <Button onClick={() => dismissAutopilot(run.projectId)}>Lanjut manual</Button>
              <span className="text-[13px] text-muted">Langkah yang sudah selesai tidak diulang.</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Header button that hands an existing project to one-click generate from wherever it stands. `compact` shows only
 * the icon, for the editor step where the export button already fills the header.
 */
export function AutopilotButton({ compact = false }: { compact?: boolean }) {
  const { project, clips } = useProject()
  const { toast, go } = useApp()
  const [busy, setBusy] = useState(false)
  if (!project) return null
  const work = remainingWork(clips, project.kind)
  const explainer = project.kind === 'explainer'
  if (!work.parts.length) return null

  const start = async (): Promise<void> => {
    if (!clips.length && !project.synopsis.trim())
      return toast('error', explainer ? 'Tulis topik videonya dulu di langkah 1.' : 'Tulis ide ceritanya dulu di langkah Ide cerita.')
    setBusy(true)
    try {
      await useProject.getState().flush()
      const [settings, keys] = await Promise.all([window.api.settings.get(), window.api.settings.keys()])
      const imageModel = project.imageModel ?? settings.imageModel
      const missing = missingServices(settings, keys, {
        story: work.story,
        // Explainer scenes can do without AI pictures; the run skips them when no image service is set up.
        imageModel: work.images && !explainer ? imageModel : null,
        tts: work.voice ? project.ttsProvider : null
      })
      if (missing.length) {
        toast('error', `Atur dulu ${joinList(missing)} di Pengaturan.`, {
          label: 'Buka Pengaturan',
          run: () => go({ name: 'settings', back: { name: 'project', id: project.id } })
        })
        return
      }
      let exportAfter = settings.autoExport
      const ok = await confirmDialog({
        title: 'Lanjutkan otomatis?',
        body:
          `Yang akan dibuat: ${joinList(work.parts)}. Bagian yang sudah jadi tidak diulang, lalu proyek terbuka di editor. ` +
          (work.images && !isNineRouterImage(imageModel) ? 'Gambar Higgsfield memakai kredit. ' : '') +
          (explainer ? 'Screenshot tutorial tetap kamu tambahkan sendiri.' : 'Video AI tidak dibuat.'),
        confirm: 'Lanjutkan otomatis',
        option: exportOption(exportAfter, (on) => (exportAfter = on))
      })
      if (!ok) return
      void window.api.settings.set({ autoExport: exportAfter })
      startAutopilot(project.id, { exportAfter })
    } finally {
      setBusy(false)
    }
  }

  if (compact)
    return (
      <IconButton label="Lanjutkan otomatis" title={`Lanjutkan otomatis: ${joinList(work.parts)}`} disabled={busy} onClick={() => void start()}>
        {busy ? <Spinner className="size-[18px]" /> : <Wand2 className="size-[18px]" />}
      </IconButton>
    )
  return (
    <Button icon={<Wand2 className="size-[17px]" />} loading={busy} onClick={() => void start()}>
      Lanjutkan otomatis
    </Button>
  )
}
