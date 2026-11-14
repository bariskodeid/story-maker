import type { Job } from '@shared/types'
import { emit } from './events'
import { getJobRaw, updateJob } from './repo'
import { cancelRequest } from './services/higgsfield'

export type QueueName = 'higgsfield' | 'ninerouter' | 'gemini' | 'tts' | 'whisper' | 'export'

export interface TaskCtx {
  jobId: string
  signal: AbortSignal
  progress(p: number, message?: string): void
  setRemote(id: string): void
}

/** A task returns the id of the asset it produced, or a message to keep on the finished job (e.g. an output path). */
export type Task = (ctx: TaskCtx) => Promise<string | void | { message: string }>

// Whisper uses most CPU cores by itself, so it runs one file at a time. 9Router images share the user's own
// subscription accounts (ChatGPT, Gemini, ...), and Gemini API image models start at low per-minute limits, both
// tighter than Higgsfield's.
const LIMITS: Record<QueueName, number> = { higgsfield: 3, ninerouter: 2, gemini: 2, tts: 2, whisper: 1, export: 1 }
const running: Record<QueueName, number> = { higgsfield: 0, ninerouter: 0, gemini: 0, tts: 0, whisper: 0, export: 0 }
const waiting: Record<QueueName, (() => void)[]> = { higgsfield: [], ninerouter: [], gemini: [], tts: [], whisper: [], export: [] }
const controllers = new Map<string, AbortController>()
// Remote ids of running jobs, kept here as well as in the table because in-memory jobs have no row to read it from.
const remotes = new Map<string, { id: string; provider: string }>()

function acquire(q: QueueName): Promise<void> {
  if (running[q] < LIMITS[q]) {
    running[q]++
    return Promise.resolve()
  }
  return new Promise((resolve) =>
    waiting[q].push(() => {
      running[q]++
      resolve()
    })
  )
}

function release(q: QueueName): void {
  running[q]--
  waiting[q].shift()?.()
}

type JobUpdater = typeof updateJob

/**
 * `update` defaults to the jobs table. Work that belongs to no project (narrator sprite sheets) passes its own
 * in-memory updater, because jobs.project_id is NOT NULL and cannot be relaxed without rewriting the table.
 */
export function runJob(job: Job, queue: QueueName, task: Task, update: JobUpdater = updateJob): Job {
  const ctrl = new AbortController()
  controllers.set(job.id, ctrl)
  let lastEmit = 0
  const ctx: TaskCtx = {
    jobId: job.id,
    signal: ctrl.signal,
    progress: (p, message) => {
      const now = Date.now()
      const j = update(job.id, { progress: Math.min(0.99, Math.max(0, p)), ...(message !== undefined ? { message } : {}) })
      if (now - lastEmit > 250 || p >= 0.99) {
        lastEmit = now
        emit.job(j)
      }
    },
    setRemote: (id) => {
      remotes.set(job.id, { id, provider: job.provider })
      update(job.id, { remoteId: id })
    }
  }
  void (async () => {
    await acquire(queue)
    if (ctrl.signal.aborted) {
      release(queue)
      controllers.delete(job.id)
      emit.job(update(job.id, { status: 'canceled', message: null }))
      return
    }
    try {
      emit.job(update(job.id, { status: 'running', progress: 0.02 }))
      const result = await task(ctx)
      const extra =
        typeof result === 'string' ? { resultAssetId: result, message: null } : { message: result?.message ?? null }
      emit.job(update(job.id, { status: 'done', progress: 1, ...extra }))
    } catch (e) {
      const canceled = ctrl.signal.aborted
      emit.job(
        update(job.id, {
          status: canceled ? 'canceled' : 'failed',
          error: canceled ? null : ((e as Error)?.message ?? String(e)),
          message: null
        })
      )
      if (!canceled) console.error(`[job ${job.kind}]`, e)
    } finally {
      release(queue)
      controllers.delete(job.id)
      remotes.delete(job.id)
    }
  })()
  return job
}

export async function cancelJob(id: string): Promise<void> {
  const raw = getJobRaw(id)
  const remote = raw ? (raw.remote_id ? { id: raw.remote_id as string, provider: raw.provider as string } : null) : (remotes.get(id) ?? null)
  if (remote?.provider === 'higgsfield') await cancelRequest(remote.id)
  const ctrl = controllers.get(id)
  if (ctrl) ctrl.abort()
  else if (raw && (raw.status === 'queued' || raw.status === 'running')) emit.job(updateJob(id, { status: 'canceled', message: null }))
}

export function isActive(id: string): boolean {
  return controllers.has(id)
}
