import { useEffect, useRef, useState } from 'react'
import { Wand2 } from 'lucide-react'
import { magicModes, type MagicField, type MagicMode, type MagicRequest } from '@shared/magic'
import { errorText } from '../lib/format'
import { useApp } from '../store/app'
import { Popover } from './Popover'
import { Spinner, cx } from './ui'

/**
 * Runs one Magic call against the active LLM and writes the result back through `onApply`.
 * `request` supplies context only; field, mode and text are filled in here.
 */
export function useMagic(opts: {
  field: MagicField
  value: string
  onApply: (text: string) => void
  request?: () => Omit<MagicRequest, 'mode' | 'text' | 'field'>
  /** Runs before the API call (e.g. flushing unsaved edits so main reads them); a throw aborts the run. */
  before?: () => Promise<void>
}): { field: MagicField; busy: boolean; run: (mode: MagicMode) => Promise<void> } {
  const { field } = opts
  const toast = useApp((s) => s.toast)
  const [busy, setBusy] = useState(false)
  // A ref, not just state: two clicks in the same tick would both see busy === false.
  const running = useRef(false)
  // Callbacks and the live value are read through refs: `run` and the undo action outlive the render
  // that created them, and must not apply into (or compare against) stale closures.
  const latest = useRef(opts)
  latest.current = opts
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const run = async (mode: MagicMode): Promise<void> => {
    if (running.current) return
    running.current = true
    setBusy(true)
    const previous = latest.current.value
    try {
      await latest.current.before?.()
      const result = await window.api.magic.run({ ...latest.current.request?.(), field, mode, text: previous })
      // The screen may be gone (or another project open) by now; a result for it must not land anywhere.
      if (!mounted.current) return
      latest.current.onApply(result.text)
      toast('success', mode === 'improve' ? 'Teks diperkaya dengan Magic.' : 'Ide baru dari Magic sudah dipasang.', {
        label: 'Urungkan',
        // Only undo while the field still holds Magic's text; anything typed since is the user's and wins.
        run: () => {
          if (mounted.current && latest.current.value === result.text) latest.current.onApply(previous)
        }
      })
    } catch (e) {
      if (mounted.current) toast('error', errorText(e))
    } finally {
      running.current = false
      if (mounted.current) setBusy(false)
    }
  }

  return { field, busy, run }
}

const SIZES = { sm: 'h-7 px-2.5 text-xs', md: 'h-8 px-3 text-[13px]' }

const MODE_ROWS: { mode: MagicMode; title: string; sub: string }[] = [
  { mode: 'improve', title: 'Perkaya teks ini', sub: 'Detail ditambah, isi ceritamu tetap' },
  { mode: 'generate', title: 'Buat ide baru', sub: 'Teks sekarang dipakai sebagai tema' }
]

/** Small pill that offers "improve" and/or "generate" depending on whether the field has text. */
export function MagicButton({
  magic,
  value,
  size = 'md',
  label = 'Magic'
}: {
  magic: ReturnType<typeof useMagic>
  value: string
  size?: 'sm' | 'md'
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const modes = magicModes(value)

  const click = (): void => {
    if (magic.busy) return
    if (modes.length === 1) void magic.run(modes[0])
    else setOpen((o) => !o)
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        data-magic={magic.field}
        aria-label={label}
        title={label}
        aria-busy={magic.busy}
        aria-haspopup={modes.length > 1 ? 'menu' : undefined}
        aria-expanded={modes.length > 1 ? open : undefined}
        disabled={magic.busy}
        onClick={click}
        className={cx(
          'inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line-2 bg-sand font-semibold text-ink-2 transition-colors hover:border-ink hover:bg-sun-soft hover:text-ink disabled:cursor-wait disabled:opacity-70',
          SIZES[size]
        )}
      >
        {magic.busy ? <Spinner className="size-3.5" /> : <Wand2 className="size-3.5" />}
        Magic
      </button>
      <Popover anchor={trigger} open={open} onClose={(reason) => {
          setOpen(false)
          if (reason === 'escape') trigger.current?.focus()
        }} width={260} align="right" label={label}>
        <div role="menu" className="flex flex-col p-1.5">
          {MODE_ROWS.map((r) => (
            <button
              key={r.mode}
              type="button"
              role="menuitem"
              data-magic-mode={r.mode}
              onClick={() => {
                setOpen(false)
                void magic.run(r.mode)
              }}
              className="flex flex-col items-start rounded-xl px-3 py-2 text-left hover:bg-sun-soft"
            >
              <span className="text-sm font-semibold">{r.title}</span>
              <span className="text-xs text-muted">{r.sub}</span>
            </button>
          ))}
        </div>
      </Popover>
    </>
  )
}
