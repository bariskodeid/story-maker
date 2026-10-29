import { useEffect, useRef, useState } from 'react'
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
  label
}: {
  value: string
  onSave: (text: string) => void
  multiline?: boolean
  minRows?: number
  maxHeight?: number
  className?: string
  placeholder?: string
  label: string
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
