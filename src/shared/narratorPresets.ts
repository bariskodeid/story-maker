import type { Narrator } from './types'

/**
 * The narrators that ship with the app. Their sprites are generated once by the maker and bundled under
 * resources/narrators/<id>/; a preset whose folder is missing stays hidden, so the list can grow before the art exists.
 * Descriptions are English because they feed the image model; key colors are picked to contrast with the character
 * so the chroma-key never eats the character itself.
 */
export interface NarratorPreset {
  id: string
  /** Indonesian display name. */
  name: string
  description: string
  style: Narrator['style']
  keyColor: Narrator['keyColor']
}

export const NARRATOR_PRESETS: NarratorPreset[] = [
  {
    id: 'pemandu-sejarah',
    name: 'Pemandu sejarah',
    description:
      'A friendly middle-aged museum guide in a brown vest, a rolled map under one arm, a warm and slightly theatrical smile, round glasses, neat grey-brown hair.',
    style: { kind: 'story', id: 'watercolor' },
    keyColor: '#00FF00'
  },
  {
    id: 'ilmuwan-muda',
    name: 'Ilmuwan muda',
    description:
      'A cheerful young scientist in a white lab coat with small goggles pushed onto the forehead, messy dark hair, curious wide eyes, a pen in the coat pocket, light green shirt.',
    style: { kind: 'story', id: 'flat' },
    keyColor: '#FF00FF'
  },
  {
    id: 'maskot-kancil',
    name: 'Maskot kancil',
    description:
      'A clever little mouse deer (kancil) mascot with big shiny eyes, soft tan fur with white spots, a tiny red scarf, standing upright like a storyteller.',
    style: { kind: 'story', id: 'fable' },
    keyColor: '#FF00FF'
  },
  {
    id: 'host-modern',
    name: 'Host modern',
    description:
      'A stylish modern young presenter in a casual blazer over a plain t-shirt, short trendy hair, confident friendly expression, wireless headset microphone, clean contemporary look.',
    style: { kind: 'story', id: 'animation3d' },
    keyColor: '#00FF00'
  },
  {
    id: 'tiramisu',
    name: 'Tiramisu',
    description:
      'A fat, fluffy light-brown "tiramisu" tabby cat with a cream-colored belly and soft darker brown stripes, round chubby body sitting upright, tiny pink nose, big calm eyes, hand-painted Ghibli-style anime look.',
    style: { kind: 'story', id: 'animepaint' },
    keyColor: '#00FF00'
  }
]
