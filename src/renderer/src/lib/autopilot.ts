import { create } from 'zustand'
import { needsVisual } from '@shared/script'
import type { Clip, Job, ProjectBundle } from '@shared/types'
import { useApp } from '../store/app'
import { useProject } from '../store/project'
import { errorText } from './format'

/**
 * One-click generate: runs idea → script → visual plan → sheets and clip images + narration (Whisper runs inside
 * the narration job) → editor, by calling the same IPCs as the step buttons.
 *
 * It lives in the renderer on purpose. The renderer's project store autosaves whole snapshots, so if the main
 * process rewrote clips and characters on its own, a stale snapshot could delete them again. Driving the steps
 * from here keeps the existing rule: every bundle an IPC returns is `load()`ed into the store when that project
 * is open. A module-level store keeps the run going while the user is on another page; it stops with the app.
 */

export type AutopilotStage = 'script' | 'visuals' | 'media' | 'finish'

export interface AutopilotRun {
  projectId: string
  stage: AutopilotStage
  state: 'running' | 'failed' | 'stopped'
  error: string | null
  stopping: boolean
  /** Every job of the project seen during the run, by id (latest state from job events). */
  jobs: Record<string, Job>
}

interface AutopilotState {
  runs: Record<string, AutopilotRun>
}

export const useAutopilot = create<AutopilotState>(() => ({ runs: {} }))

/** What a run would still make for these clips, in the order it makes them, mirroring the skips in `pipeline`. */
export function remainingWork(clips: Clip[]): { parts: string[]; story: boolean; images: boolean; voice: boolean } {
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

/** Failed images and narration get one more round before the run gives up. */
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

function failureText(id: string, missingImages: number, missingVoices: number): string {
  const parts: string[] = []
  if (missingImages) parts.push(`${missingImages} gambar klip`)
  if (missingVoices) parts.push(`${missingVoices} narasi`)
  const lastError = Object.values(runOf(id)?.jobs ?? {})
    .filter((j) => j.status === 'failed' && j.error)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0]?.error
  return `${parts.join(' dan ')} belum berhasil dibuat.${lastError ? ` Penyebab terakhir: ${lastError}` : ''}`
}

async function pipeline(id: string): Promise<void> {
  const off = window.api.on.job((j) => {
    if (j.projectId === id) patch(id, (r) => ({ jobs: { ...r.jobs, [j.id]: j } }))
  })
  try {
    await flushIfOpen(id)
    let b = await window.api.projects.get(id)

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
    for (let round = 0; round < MEDIA_ROUNDS; round++) {
      await flushIfOpen(id)
      b = await window.api.projects.get(id)
      const started: Job[] = []
      // Images and narration use separate queues, so both run at the same time.
      if (b.clips.some((c) => !c.imageAssetId)) started.push(...(await window.api.generate.missingImages(id)))
      if (b.clips.some((c) => c.narration.trim() && !c.audioAssetId)) started.push(await window.api.generate.narration(id, 'missing'))
      if (!started.length) break
      track(id, started)
      await waitFor(
        id,
        started.map((j) => j.id)
      )
      checkStop(id)
    }

    b = await window.api.projects.get(id)
    const missingImages = b.clips.filter((c) => !c.imageAssetId).length
    const missingVoices = b.clips.filter((c) => c.narration.trim() && !c.audioAssetId).length
    if (missingImages || missingVoices) throw new Error(failureText(id, missingImages, missingVoices))

    patch(id, { stage: 'finish' })
    await openEditor(id)
    useAutopilot.setState((s) => {
      const { [id]: _done, ...rest } = s.runs
      return { runs: rest }
    })
    useApp.getState().toast('success', `“${b.project.title}” siap di editor. Cek hasilnya, lalu ekspor videonya.`)
  } catch (e) {
    if (e instanceof Stopped || runOf(id)?.stopping) patch(id, { state: 'stopped', stopping: false, error: null })
    else patch(id, { state: 'failed', error: errorText(e) })
  } finally {
    off()
  }
}

/** Starts (or resumes) one-click generate. Steps already done are skipped, so a failed run can simply start again. */
export function startAutopilot(projectId: string): void {
  const run = runOf(projectId)
  if (run?.state === 'running') return
  useAutopilot.setState((s) => ({
    runs: { ...s.runs, [projectId]: { projectId, stage: 'script', state: 'running', error: null, stopping: false, jobs: run?.jobs ?? {} } }
  }))
  void pipeline(projectId)
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
