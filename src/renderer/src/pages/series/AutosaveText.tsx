import { useEffect, useRef, useState, type RefObject } from 'react'
import { AutoTextarea } from '../../components/AutoTextarea'

const SAVE_MS = 800

/**
 * A text field that saves itself shortly after typing stops, when it loses focus and when the page closes, with
 * no separate save button. While it has focus or unsaved text it ignores new values from outside, so a refresh
 * that lands mid-typing cannot undo what was just typed.
 */
export function AutosaveText({
  value,
  onSave,
  multiline = false,
  minRows = 2,
  maxHeight,
  className,
  placeholder,
  label,
  readOnly,
  applyRef,
  onTextChange
}: {
  value: string
  onSave: (text: string) => void
  multiline?: boolean
  minRows?: number
  maxHeight?: number
  className?: string
  placeholder?: string
  label: string
  readOnly?: boolean
  /** Filled with "replace the text and save now"; for text that comes from outside (Magic) and must win over focus. */
  applyRef?: RefObject<((text: string) => void) | null>
  /** Live text, ahead of `value` until the debounced save lands; hosts need it to act on what is on screen. */
  onTextChange?: (text: string) => void
}) {
  const [text, setText] = useState(value)
  const latest = useRef(value)
  const dirty = useRef(false)
  const focused = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const save = useRef(onSave)
  save.current = onSave

  useEffect(() => {
    if (dirty.current || focused.current) return
    latest.current = value
    setText(value)
  }, [value])

  const commit = (): void => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (!dirty.current) return
    dirty.current = false
    save.current(latest.current)
  }

  useEffect(() => commit, [])

  const notify = useRef(onTextChange)
  notify.current = onTextChange
  useEffect(() => notify.current?.(text), [text])

  const apply = (next: string): void => {
    if (timer.current) clearTimeout(timer.current)
    latest.current = next
    dirty.current = true
    setText(next)
    commit()
  }
  if (applyRef) applyRef.current = apply

  const change = (next: string): void => {
    latest.current = next
    dirty.current = true
    setText(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(commit, SAVE_MS)
  }

  const common = {
    value: text,
    placeholder,
    readOnly,
    'aria-label': label,
    className,
    onFocus: () => (focused.current = true),
    onBlur: () => {
      focused.current = false
      commit()
    }
  }

  return multiline ? (
    <AutoTextarea {...common} minRows={minRows} maxHeight={maxHeight} onChange={(e) => change(e.target.value)} />
  ) : (
    <input
      {...common}
      onChange={(e) => change(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
    />
  )
}
