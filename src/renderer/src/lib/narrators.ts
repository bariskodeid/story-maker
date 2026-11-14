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
  return { list, reload }
}
