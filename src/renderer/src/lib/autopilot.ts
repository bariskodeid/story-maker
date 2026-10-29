import { create } from 'zustand'
import { wantsAiImage } from '@shared/explainer'
import { needsVisual } from '@shared/script'
import type { Clip, Job, ProjectBundle, ProjectKind } from '@shared/types'
import { useApp } from '../store/app'
import { useProject } from '../store/project'
import { defaultExportOptions } from './exportOptions'
import { errorText } from './format'
import { missingServices } from './keys'

/**
 * One-click generate: runs idea → script → visual plan → sheets and clip images + narration (Whisper runs inside
 * the narration job) → editor → optionally an MP4 export, by calling the same IPCs as the step buttons.
 *
 * It lives in the renderer on purpose. The renderer's project store autosaves whole snapshots, so if the main
 * process rewrote clips and characters on its own, a stale snapshot could delete them again. Driving the steps
 * from here keeps the existing rule: every bundle an IPC returns is `load()`ed into the store when that project
 * is open. A module-level store keeps the run going while the user is on another page; it stops with the app.
 */

export type AutopilotStage = 'script' | 'visuals' | 'media' | 'finish' | 'export'
export type AutopilotResult = 'done' | 'failed' | 'stopped'

export interface AutopilotRun {
  projectId: string
  stage: AutopilotStage
  state: 'running' | 'failed' | 'stopped'
  error: string | null
  stopping: boolean
  /** Export an MP4 once the editor is ready; can be switched while the run is going. */
  exportAfter: boolean
  /** Every job of the project seen during the run, by id (latest state from job events). */
  jobs: Record<string, Job>
  /** Where the automatic export goes instead of the default folder and title (a series puts episodes in its own folder). */
  exportTarget: { folder: string; fileName: string } | null
  /** No "ready in the editor" toast; a series run reports once for all its episodes. */
  quiet: boolean
}

export interface AutopilotOptions {
  exportAfter?: boolean
  exportTarget?: { folder: string; fileName: string } | null
  quiet?: boolean
}

interface AutopilotState {
  runs: Record<string, AutopilotRun>
}

export const useAutopilot = create<AutopilotState>(() => ({ runs: {} }))

/** What a run would still make for these clips, in the order it makes them, mirroring the skips in `pipeline`. */
export function remainingWork(clips: Clip[], kind: ProjectKind = 'story'): { parts: string[]; story: boolean; images: boolean; voice: boolean } {
  if (kind === 'explainer') return explainerWork(clips)
  if (!clips.length) return { parts: ['naskah', 'rencana visual', 'gambar', 'narasi'], story: true, images: true, voice: true }
  const stale = clips.filter(needsVisual).length
  const noImage = clips.filter((c) => !c.imageAssetId).length
  const noVoice = clips.filter((c) => c.narration.trim() && !c.audioAssetId).length
  const parts: string[] = []
  if (stale) parts.push(`rencana visual ${stale} adegan`)
  if (noImage) parts.push(`${noImage} gambar klip`)
  if (noVoice) parts.push(`narasi ${noVoice} klip`)
  return { parts, story: stale > 0, images: noImage > 0, voice: noVoice > 0 }
}

/** Explainers: scenes, then AI pictures only for scenes that ask for one, then the narration. */
function explainerWork(clips: Clip[]): { parts: string[]; story: boolean; images: boolean; voice: boolean } {
  if (!clips.length) return { parts: ['adegan', 'narasi'], story: true, images: true, voice: true }
  const noImage = clips.filter((c) => wantsAiImage(c.scene) && !c.imageAssetId).length
  const noVoice = clips.filter((c) => c.narration.trim() && !c.audioAssetId).length
  const parts: string[] = []
  if (noImage) parts.push(`${noImage} gambar AI`)
  if (noVoice) parts.push(`narasi ${noVoice} adegan`)
  return { parts, story: false, images: noImage > 0, voice: noVoice > 0 }
}

/** The "export too" switch of the start dialogs, starting from the remembered choice. */
export function exportOption(initial: boolean, onChange: (on: boolean) => void) {
  return {
    label: 'Ekspor MP4 otomatis setelah editor siap',
    hint: 'Ke folder ekspor bawaan, dengan pilihan bawaan dialog Ekspor (1080p, caption ditempel).',
    initial,
    onChange
  }
}

/** Failed images and narration each get one more round before the run gives up. */
const MEDIA_ROUNDS = 2
const TERMINAL: Job['status'][] = ['done', 'failed', 'canceled']

class Stopped extends Error {}

function patch(id: string, change: Partial<AutopilotRun> | ((r: AutopilotRun) => Partial<AutopilotRun>)): void {
  useAutopilot.setState((s) => {
    const run = s.runs[id]
    if (!run) return s
    return { runs: { ...s.runs, [id]: { ...run, ...(typeof change === 'function' ? change(run) : change) } } }
  })
}

const runOf = (id: string): AutopilotRun | undefined => useAutopilot.getState().runs[id]
const isOpen = (id: string): boolean => useProject.getState().project?.id === id

function checkStop(id: string): void {
  if (runOf(id)?.stopping) throw new Stopped()
}

/** Main reads clips from the database, so unsaved edits in the open project go first. */
async function flushIfOpen(id: string): Promise<void> {
  if (isOpen(id)) await useProject.getState().flush()
}

function apply(id: string, bundle: ProjectBundle): void {
  if (isOpen(id)) useProject.getState().load(bundle)
}

function track(id: string, jobs: Job[]): void {
  // A job event may already have brought a newer state than the one the IPC returned.
  patch(id, (r) => ({ jobs: Object.fromEntries([...jobs.map((j) => [j.id, j] as const), ...Object.entries(r.jobs)]) }))
}

/** Resolves once every job has ended. Job events keep the run current; a slow poll covers anything missed. */
function waitFor(id: string, jobIds: string[]): Promise<void> {
  return new Promise((resolve) => {
    let polls = 0
    const timer = setInterval(() => {
      const run = runOf(id)
      if (!run) {
        clearInterval(timer)
        return resolve()
      }
      if (jobIds.every((j) => run.jobs[j] && TERMINAL.includes(run.jobs[j].status))) {
        clearInterval(timer)
        return resolve()
      }
      if (++polls % 20 === 0) void window.api.projects.get(id).then((b) => track(id, b.jobs.filter((j) => jobIds.includes(j.id))))
    }, 500)
  })
}

const needsVoice = (c: Clip): boolean => !!c.narration.trim() && !c.audioAssetId

/**
 * Pictures and narration run side by side (they use separate queues), each with its own rounds: a narration that
 * fails fast is tried again at once instead of after every picture of the first round.
 */
async function makeMedia(id: string, wantsImage: (c: Clip) => boolean): Promise<void> {
  const lane = async (start: () => Promise<Job[]>, missing: (b: ProjectBundle) => boolean): Promise<void> => {
    for (let round = 0; round < MEDIA_ROUNDS; round++) {
      checkStop(id)
      await flushIfOpen(id)
      if (!missing(await window.api.projects.get(id))) return
      const jobs = await start()
      if (!jobs.length) return
      track(id, jobs)
      await waitFor(
        id,
        jobs.map((j) => j.id)
      )
      checkStop(id)
    }
  }
  await Promise.all([
    lane(
      () => window.api.generate.missingImages(id),
      (b) => b.clips.some(wantsImage)
    ),
    lane(
      async () => [await window.api.generate.narration(id, 'missing')],
      (b) => b.clips.some(needsVoice)
    )
  ])
}

async function openEditor(id: string): Promise<void> {
  if (isOpen(id)) {
    const { project, updateProject, flush } = useProject.getState()
    updateProject({ step: 4, status: project?.status === 'exported' ? 'exported' : 'editing' })
    await flush()
    return
  }
  const b = await window.api.projects.get(id)
  await window.api.projects.save({
    project: { ...b.project, step: 4, status: b.project.status === 'exported' ? 'exported' : 'editing' },
    characters: b.characters,
    clips: b.clips
  })
}

async function exportVideo(id: string): Promise<void> {
  patch(id, { stage: 'export' })
  await flushIfOpen(id)
  const b = await window.api.projects.get(id)
  const target = runOf(id)?.exportTarget
  const options = defaultExportOptions(b.project, target?.folder ?? (await window.api.exporter.defaultFolder()))
  const job = await window.api.exporter.start(id, target ? { ...options, fileName: target.fileName } : options)
  track(id, [job])
  await waitFor(id, [job.id])
  checkStop(id)
  const done = runOf(id)?.jobs[job.id]
  if (done?.status !== 'done') throw new Error(`Ekspor video gagal${done?.error ? `: ${done.error}` : '.'}`)
  // Main marks the project exported; the open store must agree or its next autosave would undo it.
  if (isOpen(id)) useProject.getState().updateProject({ status: 'exported' })
}

function failureText(id: string, missingImages: number, missingVoices: number): string {
  const parts: string[] = []
  if (missingImages) parts.push(`${missingImages} gambar klip`)
  if (missingVoices) parts.push(`${missingVoices} narasi`)
  const lastError = Object.values(runOf(id)?.jobs ?? {})
    .filter((j) => j.status === 'failed' && j.error)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0]?.error
  return `${parts.join(' dan ')} belum berhasil dibuat.${lastError ? ` Penyebab terakhir: ${lastError}` : ''}`
}

/**
 * Explainer media: scenes from the idea, AI pictures for the scenes that ask for one (skipped when no image
 * service is set up; those scenes are designed without a picture), and the narration.
 */
async function explainerMedia(id: string, start: ProjectBundle): Promise<ProjectBundle> {
  let b = start
  if (!b.clips.length) {
    patch(id, { stage: 'script' })
    b = await window.api.explainer.scenes(id)
    apply(id, b)
  }
  checkStop(id)
  patch(id, { stage: 'media' })
  const [settings, keys] = await Promise.all([window.api.settings.get(), window.api.settings.keys()])
  const images = missingServices(settings, keys, { story: false, imageModel: b.project.imageModel ?? settings.imageModel, tts: null }).length === 0
  const wantsImage = (c: Clip): boolean => images && wantsAiImage(c.scene) && !c.imageAssetId
  await makeMedia(id, wantsImage)
  b = await window.api.projects.get(id)
  const missingImages = b.clips.filter(wantsImage).length
  const missingVoices = b.clips.filter(needsVoice).length
  if (missingImages || missingVoices) throw new Error(failureText(id, missingImages, missingVoices))
  return b
}

/** Opens the editor, exports when asked, and ends the run: the last stages of every kind of project. */
async function finishRun(id: string, b: ProjectBundle): Promise<'done'> {
  patch(id, { stage: 'finish' })
  await openEditor(id)
  checkStop(id)

  const exported = runOf(id)?.exportAfter ?? false
  if (exported) await exportVideo(id)

  // A series run reports once for all its episodes.
  const quiet = runOf(id)?.quiet ?? false
  useAutopilot.setState((s) => {
    const { [id]: _done, ...rest } = s.runs
    return { runs: rest }
  })
  // An export brings its own "Video selesai diekspor" toast with a button to open the folder (App.tsx).
  if (!exported && !quiet) useApp.getState().toast('success', `“${b.project.title}” siap di editor. Cek hasilnya, lalu ekspor videonya.`)
  return 'done'
}

async function pipeline(id: string): Promise<AutopilotResult> {
  const off = window.api.on.job((j) => {
    if (j.projectId === id) patch(id, (r) => ({ jobs: { ...r.jobs, [j.id]: j } }))
  })
  try {
    await flushIfOpen(id)
    let b = await window.api.projects.get(id)

    if (b.project.kind === 'explainer') return await finishRun(id, await explainerMedia(id, b))

    if (!b.clips.length) {
      patch(id, { stage: 'script' })
      b = await window.api.story.script(id)
      apply(id, b)
    }
    checkStop(id)

    if (b.clips.some(needsVisual)) {
      patch(id, { stage: 'visuals' })
      b = await window.api.story.visuals(id, 'missing')
      apply(id, b)
    }
    checkStop(id)

    patch(id, { stage: 'media' })
    await makeMedia(id, (c) => !c.imageAssetId)

    b = await window.api.projects.get(id)
    const missingImages = b.clips.filter((c) => !c.imageAssetId).length
    const missingVoices = b.clips.filter(needsVoice).length
    if (missingImages || missingVoices) throw new Error(failureText(id, missingImages, missingVoices))

    return await finishRun(id, b)
  } catch (e) {
    if (e instanceof Stopped || runOf(id)?.stopping) {
      patch(id, { state: 'stopped', stopping: false, error: null })
      return 'stopped'
    }
    patch(id, { state: 'failed', error: errorText(e) })
    return 'failed'
  } finally {
    off()
  }
}

/** Resolves when a run that is already going ends: a finished run is removed, the others stay stopped or failed. */
function untilEnded(id: string): Promise<AutopilotResult> {
  return new Promise((resolve) => {
    const ended = (s: AutopilotState): boolean => {
      const run = s.runs[id]
      if (run?.state === 'running') return false
      resolve(run ? run.state : 'done')
      return true
    }
    if (ended(useAutopilot.getState())) return
    const off = useAutopilot.subscribe((s) => {
      if (ended(s)) off()
    })
  })
}

/**
 * Starts (or resumes) one-click generate and resolves with how it ended. Steps already done are skipped, so a failed
 * run can simply start again. Options left out keep the previous run's choice.
 */
export function runAutopilot(projectId: string, opts: AutopilotOptions = {}): Promise<AutopilotResult> {
  const run = runOf(projectId)
  if (run?.state === 'running') return untilEnded(projectId)
  const next: AutopilotRun = {
    projectId,
    stage: 'script',
    state: 'running',
    error: null,
    stopping: false,
    exportAfter: opts.exportAfter ?? run?.exportAfter ?? false,
    jobs: run?.jobs ?? {},
    exportTarget: opts.exportTarget !== undefined ? opts.exportTarget : (run?.exportTarget ?? null),
    quiet: opts.quiet ?? run?.quiet ?? false
  }
  useAutopilot.setState((s) => ({ runs: { ...s.runs, [projectId]: next } }))
  return pipeline(projectId)
}

/** Starts one-click generate without waiting for it (the start buttons). */
export function startAutopilot(projectId: string, opts: AutopilotOptions = {}): void {
  void runAutopilot(projectId, opts)
}

/** Flips automatic export for a run and remembers the choice for the next one. */
export function setAutoExport(projectId: string, on: boolean): void {
  patch(projectId, { exportAfter: on })
  void window.api.settings.set({ autoExport: on })
}

/** Stops after the current step: running image and voice jobs are canceled; a script or plan in progress finishes. */
export async function stopAutopilot(projectId: string): Promise<void> {
  const run = runOf(projectId)
  if (!run || run.state !== 'running') return
  patch(projectId, { stopping: true })
  const active = Object.values(run.jobs).filter((j) => !TERMINAL.includes(j.status))
  await Promise.all(active.map((j) => window.api.generate.cancel(j.id).catch(() => undefined)))
}

/** Leaves a stopped or failed run so the project shows its normal steps again. */
export function dismissAutopilot(projectId: string): void {
  useAutopilot.setState((s) => {
    const { [projectId]: _gone, ...rest } = s.runs
    return { runs: rest }
  })
}
