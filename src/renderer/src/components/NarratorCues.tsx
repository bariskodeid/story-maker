import { useRef, useState } from 'react'
import { Check, ChevronDown, Wand2 } from 'lucide-react'
import { NARRATOR_EXPRESSIONS, splitSentences } from '@shared/narrator'
import type { Clip, NarratorExpression } from '@shared/types'
import { errorText } from '../lib/format'
import { EXPRESSION_EMOJI, EXPRESSION_LABEL, useNarrators } from '../lib/narrators'
import { useApp } from '../store/app'
import { useProject } from '../store/project'
import { Popover } from './Popover'
import { Button, cx } from './ui'

function ExpressionChip({ value, onChange, label }: { value: NarratorExpression; onChange: (e: NarratorExpression) => void; label: string }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button
        ref={trigger}
        type="button"
        data-cue-chip
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border bg-paper pl-2 pr-2.5 text-[13px] font-medium',
          open ? 'border-ink' : 'border-line-2 hover:border-ink-2'
        )}
      >
        <span aria-hidden>{EXPRESSION_EMOJI[value]}</span>
        {EXPRESSION_LABEL[value]}
        <ChevronDown className="size-3 text-ink-2" />
      </button>
      <Popover anchor={trigger} open={open} onClose={() => setOpen(false)} width={180} align="right" label="Ekspresi">
        <div role="menu" className="flex flex-col p-1.5">
          {NARRATOR_EXPRESSIONS.map((e) => (
            <button
              key={e}
              type="button"
              role="menuitemradio"
              aria-checked={e === value}
              data-cue-option={e}
              onClick={() => {
                setOpen(false)
                onChange(e)
              }}
              className={cx('flex items-center gap-2 rounded-xl px-3 py-1.5 text-left text-sm hover:bg-sun-soft', e === value && 'bg-sun-soft font-semibold')}
            >
              <span aria-hidden>{EXPRESSION_EMOJI[e]}</span>
              <span className="flex-1">{EXPRESSION_LABEL[e]}</span>
              {e === value && <Check className="size-3.5" />}
            </button>
          ))}
        </div>
      </Popover>
    </>
  )
}

/**
 * Per-sentence expression editor for one clip. Shows only while the project has a narrator that exists and is on.
 * Cues are stored by sentence position, so a sentence without a cue (text was edited) reads as neutral.
 */
export function NarratorCues({ clip, className }: { clip: Clip; className?: string }) {
  const { project, clips, updateClip, flush, load } = useProject()
  const toast = useApp((s) => s.toast)
  const { list } = useNarrators()
  const [busy, setBusy] = useState(false)
  const settings = project?.narrator
  if (!project || !settings?.enabled || !settings.id) return null
  // A deleted narrator counts as off, so there is nothing to edit.
  if (list && !list.some((n) => n.id === settings.id)) return null

  const sentences = splitSentences(clip.narration)
  const cues = clip.narratorCues ?? []
  const setCue = (i: number, e: NarratorExpression): void => {
    const next = sentences.map((_, k) => cues[k] ?? 'neutral')
    next[i] = e
    updateClip(clip.id, { narratorCues: next })
  }

  const auto = async (): Promise<void> => {
    setBusy(true)
    try {
      await flush()
      load(await window.api.narrators.assignCues(project.id))
      toast('success', `Ekspresi ${clips.length} ${project.kind === 'explainer' ? 'adegan' : 'klip'} dipilih otomatis.`)
    } catch (e) {
      toast('error', errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={cx('flex flex-col gap-2.5', className)} data-narrator-cues>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">Ekspresi narator</span>
        <Button size="sm" loading={busy} icon={!busy && <Wand2 className="size-3.5" />} onClick={() => void auto()}>
          Pilih ekspresi otomatis
        </Button>
      </div>
      {sentences.length ? (
        <ol className="flex flex-col gap-1.5">
          {sentences.map((s, i) => (
            <li key={i} className="flex items-start gap-2.5 rounded-xl border border-line bg-surface px-2.5 py-2">
              <span className="min-w-0 flex-1 text-[13px] leading-snug text-ink-2">{s}</span>
              <ExpressionChip value={cues[i] ?? 'neutral'} label={`Ekspresi kalimat ${i + 1}`} onChange={(e) => setCue(i, e)} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-muted">Naskah masih kosong.</p>
      )}
    </div>
  )
}
