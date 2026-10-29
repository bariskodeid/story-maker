import { create } from 'zustand'
import { needsVisual } from '@shared/script'
import { episodeTag, stripEpisodeTag } from '@shared/series'
import type { ProjectBundle, SeriesBundle, SeriesEpisode, SeriesKind } from '@shared/types'
import { useApp } from '../store/app'
import { useProject } from '../store/project'
import { remainingWork, runAutopilot, setAutoExport, stopAutopilot, useAutopilot } from './autopilot'
import { slug } from './exportOptions'
import { errorText } from './format'
import { episodeWord } from './seriesWords'

/**
 * One-click generate for a whole series: plans it when it has no episodes yet, then runs one-click generate on
 * each unfinished episode in order. Episodes run one after another, never side by side: a serial episode's script
 * is written from the summaries of the ones before it, every episode reuses the character sheets the earlier ones
 * made (copied back to the series after each episode), and image and voice providers have tight rate limits.
 *
 * Like `autopilot.ts` it lives in the renderer, so an episode that is open in the editor gets every bundle loaded
 * into its store and a stale autosave cannot undo the copied cast.
 */

export type SeriesStage = 'plan' | 'episodes'

export interface SeriesRun {
  seriesId: string
  stage: SeriesStage
  state: 'running' | 'failed' | 'stopped'
  stopping: boolean
  exportAfter: boolean
  /** The episode being made, or the one that failed or was stopped. */
  current: { id: string; no: number; title: string } | null
  /** How many episodes the series has, and how many of them are finished. */
  total: number
  done: number
  error: string | null
}

interface SeriesAutopilotState {
  runs: Record<string, SeriesRun>
  /** Series whose plan (bible, cast, episode outlines) is being written. */
  planning: Record<string, boolean>
}

export const useSeriesAutopilot = create<SeriesAutopilotState>(() => ({ runs: {}, planning: {} }))

class Stopped extends Error {}

const runOf = (id: string): SeriesRun | undefined => useSeriesAutopilot.getState().runs[id]

function patch(id: string, change: Partial<SeriesRun>): void {
  useSeriesAutopilot.setState((s) => {
    const run = s.runs[id]
    return run ? { runs: { ...s.runs, [id]: { ...run, ...change } } } : s
  })
}

function checkStop(id: string): void {
  if (runOf(id)?.stopping) throw new Stopped()
}

function setPlanning(id: string, on: boolean): void {
  useSeriesAutopilot.setState((s) => {
    const { [id]: _was, ...rest } = s.planning
    return { planning: on ? { ...rest, [id]: true } : rest }
  })
}

/** Writes the series plan and creates the episode projects; the series page shows it while `planning` is set. */
export async function planSeries(seriesId: string): Promise<SeriesBundle> {
  setPlanning(seriesId, true)
  try {
    return await window.api.series.plan(seriesId)
  } finally {
    setPlanning(seriesId, false)
  }
}

/** `folder/name` with the separator the folder already uses (Windows paths come with backslashes). */
function joinPath(folder: string, name: string): string {
  const sep = folder.includes('\\') && !folder.includes('/') ? '\\' : '/'
  return `${folder.replace(/[\\/]+$/, '')}${sep}${name}`
}

/** The series' own export folder inside the default one, e.g. `Videos/Story Maker/petualangan-kancil`. */
export async function seriesExportFolder(title: string): Promise<string> {
  return joinPath(await window.api.exporter.defaultFolder(), slug(title))
}

/** `E01-judul-episode`, so the files sort in episode order. */
export function episodeFileName(ep: Pick<SeriesEpisode, 'no' | 'title'>): string {
  return `${episodeTag(ep.no)}-${slug(stripEpisodeTag(ep.title))}`
}

/** Nothing left for one-click generate to do: scenes made, in the editor, and exported when that is wanted. */
export function episodeFinished(b: ProjectBundle, exportWanted: boolean): boolean {
  return (
    b.clips.length > 0 &&
    remainingWork(b.clips, b.project.kind).parts.length === 0 &&
    b.project.step === 4 &&
    (!exportWanted || b.project.status === 'exported')
  )
}

const isOpen = (id: string): boolean => useProject.getState().project?.id === id

/**
 * One episode through one-click generate. In a story series the series cast goes in first (so its sheets are reused,
 * not drawn again), and what the episode added comes back to the series afterwards. Explainer series have no cast.
 */
export async function runEpisode(
  ep: Pick<SeriesEpisode, 'id' | 'no' | 'title'>,
  opts: { kind: SeriesKind; exportAfter: boolean; folder: string; quiet: boolean; stopped?: () => boolean }
): Promise<'done' | 'failed' | 'stopped'> {
  const cast = opts.kind === 'story'
  if (cast) {
    // Main reads the database, so unsaved edits of an open episode go first; the store then takes the copied cast.
    if (isOpen(ep.id)) await useProject.getState().flush()
    // Missing series characters only matter while the script or the visual plan is still to be written; later on
    // only their sheets are copied. Characters removed from the episode by hand are never added back (main).
    const b = await window.api.projects.get(ep.id)
    const fresh = await window.api.series.syncCastIn(ep.id, { addMissing: !b.clips.length || b.clips.some(needsVisual) })
    if (isOpen(ep.id)) useProject.getState().load(fresh)
  }
  // A stop that came while the cast was copied has no episode run to cancel yet.
  if (opts.stopped?.()) return 'stopped'
  const result = await runAutopilot(ep.id, {
    exportAfter: opts.exportAfter,
    exportTarget: { folder: opts.folder, fileName: episodeFileName(ep) },
    quiet: opts.quiet
  })
  // Sheets made before a stop or failure are worth keeping for the other episodes too.
  if (cast) await window.api.series.syncCastOut(ep.id).catch(() => null)
  return result
}

async function pipeline(seriesId: string): Promise<void> {
  try {
    let bundle = await window.api.series.get(seriesId)
    if (!bundle.episodes.length) {
      patch(seriesId, { stage: 'plan' })
      bundle = await planSeries(seriesId)
    }
    checkStop(seriesId)
    patch(seriesId, { stage: 'episodes', total: bundle.episodes.length, done: 0 })
    const folder = await seriesExportFolder(bundle.series.title)

    let done = 0
    for (const ep of bundle.episodes) {
      checkStop(seriesId)
      const exportAfter = runOf(seriesId)?.exportAfter ?? false
      if (isOpen(ep.id)) await useProject.getState().flush()
      if (episodeFinished(await window.api.projects.get(ep.id), exportAfter)) {
        patch(seriesId, { done: ++done })
        continue
      }
      patch(seriesId, { current: { id: ep.id, no: ep.no, title: stripEpisodeTag(ep.title) } })
      const result = await runEpisode(ep, {
        kind: bundle.series.kind,
        exportAfter,
        folder,
        quiet: true,
        stopped: () => !!runOf(seriesId)?.stopping
      })
      if (result === 'stopped') throw new Stopped()
      if (result === 'failed') {
        const why = useAutopilot.getState().runs[ep.id]?.error
        throw new Error(`${episodeWord(bundle.series).title} ${ep.no} gagal dibuat.${why ? ` ${why}` : ''}`)
      }
      patch(seriesId, { done: ++done })
    }

    const exported = runOf(seriesId)?.exportAfter ?? false
    const word = episodeWord(bundle.series).one
    useSeriesAutopilot.setState((s) => {
      const { [seriesId]: _done, ...rest } = s.runs
      return { runs: rest }
    })
    useApp
      .getState()
      .toast(
        'success',
        exported
          ? `Semua ${word} “${bundle.series.title}” sudah diekspor ke folder seri.`
          : `Semua ${word} “${bundle.series.title}” siap di editor. Cek hasilnya, lalu ekspor videonya.`,
        exported ? { label: 'Buka folder', run: () => void window.api.exporter.reveal(folder) } : undefined
      )
  } catch (e) {
    if (e instanceof Stopped || runOf(seriesId)?.stopping) patch(seriesId, { state: 'stopped', stopping: false, error: null })
    else patch(seriesId, { state: 'failed', error: errorText(e) })
  }
}

/** Starts (or resumes) the whole-series run; finished episodes are skipped, so a stopped or failed run can simply start again. */
export function startSeriesAutopilot(seriesId: string, opts: { exportAfter?: boolean } = {}): void {
  const run = runOf(seriesId)
  if (run?.state === 'running') return
  useSeriesAutopilot.setState((s) => ({
    runs: {
      ...s.runs,
      [seriesId]: {
        seriesId,
        stage: 'episodes',
        state: 'running',
        stopping: false,
        exportAfter: opts.exportAfter ?? run?.exportAfter ?? false,
        current: run?.current ?? null,
        total: run?.total ?? 0,
        done: 0,
        error: null
      }
    }
  }))
  void pipeline(seriesId)
}

/** Stops after the current step of the current episode. */
export async function stopSeriesAutopilot(seriesId: string): Promise<void> {
  const run = runOf(seriesId)
  if (!run || run.state !== 'running') return
  patch(seriesId, { stopping: true })
  if (run.current) await stopAutopilot(run.current.id)
}

/** Flips automatic export for the rest of the run, including the episode being made, and remembers the choice. */
export function setSeriesAutoExport(seriesId: string, on: boolean): void {
  patch(seriesId, { exportAfter: on })
  const current = runOf(seriesId)?.current
  if (current && useAutopilot.getState().runs[current.id]?.state === 'running') setAutoExport(current.id, on)
  else void window.api.settings.set({ autoExport: on })
}

export function dismissSeriesAutopilot(seriesId: string): void {
  useSeriesAutopilot.setState((s) => {
    const { [seriesId]: _gone, ...rest } = s.runs
    return { runs: rest }
  })
}
