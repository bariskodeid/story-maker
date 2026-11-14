import { useEffect, useState } from 'react'
import { pickSprite } from '@shared/narrator'
import type { Narrator, NarratorSettings } from '@shared/types'

/** The narrator's sprite URLs and width/height ratio, or null when it is off, gone or has no sprites yet. */
export function useNarratorSprites(settings: NarratorSettings): { urls: Record<string, string>; aspect: number } | null {
  const [found, setFound] = useState<{ id: string; urls: Record<string, string>; aspect: number } | null>(null)
  const id = settings.enabled ? settings.id : null
  // Bumped when this narrator's sheet is redrawn: the hook would otherwise keep the old sprites and aspect ratio.
  const [version, setVersion] = useState(0)
  useEffect(() => {
    if (!id) return
    return window.api.on.job((j) => {
      if (j.kind === 'sheet' && j.characterId === id && j.status === 'done') setVersion((v) => v + 1)
    })
  }, [id])
  useEffect(() => {
    if (!id) return
    let live = true
    window.api.narrators
      .get(id)
      .then((n: Narrator) => {
        const urls = n.spriteUrls
        const base = urls ? urls[pickSprite('neutral-closed', new Set(Object.keys(urls))) ?? ''] : null
        if (!urls || !base) return
        const img = new Image()
        img.onload = () => live && setFound({ id, urls, aspect: img.naturalWidth / Math.max(1, img.naturalHeight) })
        img.src = base
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [id, version])
  return id && found?.id === id ? found : null
}
