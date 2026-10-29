import { useEffect, useState, type ReactNode } from 'react'
import { AlertCircle, ArrowLeft, Check, CheckCircle2, Layers, Loader2, Pencil, Save, SlidersHorizontal } from 'lucide-react'
import { episodeTag } from '@shared/series'
import type { Step } from '@shared/types'
import { Button, IconButton, Kbd, cx } from '../../components/ui'
import { relativeTime } from '../../lib/format'
import { useApp } from '../../store/app'
import { useProject } from '../../store/project'

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: 'Ide cerita' },
  { n: 2, label: 'Naskah' },
  { n: 3, label: 'Storyboard' },
  { n: 4, label: 'Editor' }
]

// Explainers have no storyboard: scenes are designed, so step 3 is skipped and the editor stays step 4.
const EXPLAINER_STEPS: { n: Step; label: string }[] = [
  { n: 1, label: 'Ide & template' },
  { n: 2, label: 'Adegan' },
  { n: 4, label: 'Editor' }
]

function SaveStatus() {
  const { saveState, saveError, savedAt, save } = useProject()
  if (saveState === 'saving')
    return (
      <span className="flex items-center gap-1.5 text-xs text-sun-ink">
        <Loader2 className="size-3.5 animate-[spin_0.8s_linear_infinite]" />
        Menyimpan…
      </span>
    )
  if (saveState === 'dirty')
    return (
      <span className="flex items-center gap-1.5 text-xs text-accent-dark">
        <span className="size-[7px] rounded-full bg-accent" />
        Ada perubahan belum disimpan
      </span>
    )
  if (saveState === 'error')
    return (
      <span className="flex items-center gap-1.5 text-xs text-bad-ink" title={saveError ?? ''}>
        <AlertCircle className="size-3.5" />
        Gagal menyimpan ·
        <button type="button" className="font-semibold underline" onClick={() => void save()}>
          Coba lagi
        </button>
      </span>
    )
  return (
    <span className="flex items-center gap-1.5 text-xs text-ok-ink">
      <CheckCircle2 className="size-3.5" />
      Tersimpan · {savedAt ? relativeTime(savedAt) : 'baru saja'}
    </span>
  )
}

/** `locked`: one-click generate is working on this project, so the steps cannot be opened yet. */
export function ProjectHeader({ doneSteps, right, locked = false }: { doneSteps: Step[]; right?: ReactNode; locked?: boolean }) {
  const { project, updateProject, save, flush } = useProject()
  const { go } = useApp()
  const [editing, setEditing] = useState(false)
  const [seriesTitle, setSeriesTitle] = useState<string | null>(null)
  const seriesId = project?.seriesId ?? null
  useEffect(() => {
    if (!seriesId) return setSeriesTitle(null)
    window.api.series
      .get(seriesId)
      .then((b) => setSeriesTitle(b.series.title))
      .catch(() => setSeriesTitle(null))
  }, [seriesId])
  if (!project) return null

  const setStep = (n: Step): void => {
    const s = project.status
    const status =
      n === 4 && s !== 'exported' ? 'editing' : n === 3 && (s === 'draft' || s === 'script') ? 'storyboard' : n === 2 && s === 'draft' ? 'script' : s
    updateProject({ step: n, status })
  }

  return (
    <header className="grid h-[68px] shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 border-b border-line bg-surface px-6">
      <div className="flex min-w-0 items-center gap-3">
        <IconButton
          label={seriesId ? 'Kembali ke seri' : 'Kembali ke beranda'}
          onClick={async () => {
            await flush()
            go(seriesId ? { name: 'series', id: seriesId } : { name: 'home' })
          }}
        >
          <ArrowLeft className="size-[18px]" />
        </IconButton>
        <div className="flex min-w-0 flex-col gap-px">
          {seriesId && (
            <button
              type="button"
              onClick={async () => {
                await flush()
                go({ name: 'series', id: seriesId })
              }}
              className="flex min-w-0 items-center gap-1 text-left text-[11px] font-semibold leading-4 text-ink-2 hover:text-ink hover:underline"
            >
              <Layers className="size-3 shrink-0" />
              <span className="truncate">{seriesTitle ?? 'Seri'}</span>
              {project.episodeNo != null && <span className="shrink-0 font-mono font-medium text-muted">/ {episodeTag(project.episodeNo)}</span>}
            </button>
          )}
          <div className="flex min-w-0 items-center gap-1">
            {editing ? (
              <input
                autoFocus
                defaultValue={project.title}
                aria-label="Judul proyek"
                onBlur={(e) => {
                  updateProject({ title: e.target.value.trim() || project.title })
                  setEditing(false)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  if (e.key === 'Escape') setEditing(false)
                }}
                className="h-8 w-[320px] rounded-lg border border-ink bg-surface px-2 font-display text-lg font-bold outline-none"
              />
            ) : (
              <>
                <span className="truncate font-display text-lg font-bold">{project.title}</span>
                <button
                  type="button"
                  aria-label="Ganti nama proyek"
                  onClick={() => setEditing(true)}
                  className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-sand hover:text-ink"
                >
                  <Pencil className="size-[15px]" />
                </button>
              </>
            )}
          </div>
          <SaveStatus />
        </div>
      </div>

      <nav aria-label="Langkah pembuatan" className="flex items-center gap-1 rounded-full border border-line bg-sand p-1">
        {(project.kind === 'explainer' ? EXPLAINER_STEPS : STEPS).map((s, i) => {
          const active = project.step === s.n || (project.kind === 'explainer' && s.n === 2 && project.step === 3)
          const done = doneSteps.includes(s.n) && !active
          return (
            <button
              key={s.n}
              type="button"
              aria-current={active ? 'step' : undefined}
              disabled={locked}
              title={locked ? 'Tunggu sampai pembuatan otomatis selesai atau dihentikan' : undefined}
              onClick={() => setStep(s.n)}
              className={cx(
                'inline-flex h-9 items-center gap-2 rounded-full py-0 pl-1.5 pr-4 text-sm disabled:cursor-not-allowed',
                active && !locked ? 'bg-ink font-semibold text-paper' : 'font-medium text-ink-2',
                !locked && !active && 'hover:text-ink'
              )}
            >
              <span
                className={cx(
                  'inline-flex size-6 items-center justify-center rounded-full text-xs',
                  active && !locked ? 'bg-accent text-white' : done ? 'bg-ok-soft text-ok-ink' : 'border border-line-2 bg-surface text-ink-2'
                )}
              >
                {done ? <Check className="size-[13px]" strokeWidth={3} /> : i + 1}
              </span>
              {s.label}
            </button>
          )
        })}
      </nav>

      <div className="flex items-center justify-end gap-2.5">
        <Button icon={<Save className="size-[17px]" />} onClick={() => void save()}>
          Simpan
          <Kbd>Ctrl S</Kbd>
        </Button>
        <IconButton
          label="Pengaturan"
          onClick={async () => {
            await flush()
            go({ name: 'settings', back: { name: 'project', id: project.id } })
          }}
        >
          <SlidersHorizontal className="size-[18px]" />
        </IconButton>
        {right}
      </div>
    </header>
  )
}
