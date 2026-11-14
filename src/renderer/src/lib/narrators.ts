import { useCallback, useEffect, useState } from 'react'
import type { Narrator, NarratorExpression } from '@shared/types'

export const EXPRESSION_LABEL: Record<NarratorExpression, string> = {
  neutral: 'Netral',
  happy: 'Senang',
  sad: 'Sedih',
  surprised: 'Kaget',
  serious: 'Serius',
  thinking: 'Berpikir'
}

export const EXPRESSION_EMOJI: Record<NarratorExpression, string> = {
  neutral: '😐',
  happy: '😄',
  sad: '😢',
  surprised: '😮',
  serious: '🧐',
  thinking: '🤔'
}

/** How many narrator dialogs are open; they show a failed sheet job inline, so the global toast stays quiet then. */
let openDialogs = 0
export const narratorDialogOpened = (): (() => void) => {
  openDialogs++
  return () => {
    openDialogs--
  }
}
export const narratorDialogIsOpen = (): boolean => openDialogs > 0

/** The narrator collection, refetched on demand (after the dialog created, changed or removed one). */
export function useNarrators(): { list: Narrator[] | null; reload: () => Promise<Narrator[]> } {
  const [list, setList] = useState<Narrator[] | null>(null)
  const reload = useCallback(async () => {
    const next = await window.api.narrators.list()
    setList(next)
    return next
  }, [])
  useEffect(() => {
    void reload().catch(() => setList([]))
  }, [reload])
  // A sheet can finish after its dialog was closed; the picker owns the list, so it refreshes it on any sheet job end.
  useEffect(
    () =>
      window.api.on.job((j) => {
        if (j.kind === 'sheet' && !j.projectId && (j.status === 'done' || j.status === 'failed' || j.status === 'canceled')) void reload().catch(() => undefined)
      }),
    [reload]
  )
  return { list, reload }
}
