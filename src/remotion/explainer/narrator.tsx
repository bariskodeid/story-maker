import { useMemo } from 'react'
import { Img, useCurrentFrame, useVideoConfig } from 'remotion'
import type { ExplainerInput } from '@shared/explainer'
import { narratorSpriteAt, pickSprite, prepareNarratorTrack } from '@shared/narrator'
import { narratorRect } from './layout'

/**
 * The animated narrator over the scenes and under the captions. Only the sprite swap is drawn, no breathing or
 * bounce, the same as the story video, whose FFmpeg export cannot do them. Every sprite stays mounted and only
 * the current one is visible, so a swap never waits on an image (and the render waits for all of them once).
 */
export function NarratorLayer({ input }: { input: ExplainerInput }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const n = input.narrator
  const track = useMemo(() => (n ? prepareNarratorTrack(n.track) : null), [n])
  const rect = narratorRect(input)
  if (!n || !track || !rect) return null
  const f = narratorSpriteAt(track, frame / fps)
  const keys = Object.keys(n.sprites)
  const current = pickSprite(`${f.expression}-${f.mouth}`, new Set(keys))
  return (
    <div style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
      {keys.map((k) => (
        <Img key={k} src={n.sprites[k]} style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', visibility: k === current ? 'visible' : 'hidden' }} />
      ))}
    </div>
  )
}
