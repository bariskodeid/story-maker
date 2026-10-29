import { clipCaptionWords } from './timeline'
import type { AspectRatio, Asset, Clip, Project, WordTiming } from './types'

/**
 * Explainer videos (tutorials, tips, facts, quotes): every clip is one designed scene, drawn by the Remotion
 * composition in src/remotion. The app's Player and the MP4 render get their props from `buildExplainerInput`
 * below, so the preview and the export are the same component with the same data (only the file URLs differ).
 */

export type ExplainerTemplateId = 'tutorial' | 'tips' | 'facts' | 'quote' | 'compare' | 'news'
export type SceneType =
  | 'title'
  | 'step'
  | 'tip'
  | 'fact'
  | 'quote'
  | 'compare'
  | 'outro'
  | 'versus'
  | 'proscons'
  | 'verdict'
  | 'headline'
  | 'points'
/** Where a scene's picture comes from: none, a file the user adds (screenshots), or the AI image pipeline. */
export type SceneImageMode = 'none' | 'upload' | 'ai'
export type CodeKind = 'none' | 'code' | 'terminal'
/** Which of the two options (A = left, B = right) a scene is about or favors; "both" is a tie. */
export type SceneSide = 'none' | 'left' | 'right' | 'both'

/** A box on the scene's image, as fractions of the image (0–1), drawn as an animated highlight. */
export interface SceneHighlight {
  x: number
  y: number
  w: number
  h: number
}

/**
 * One scene. Flat on purpose: the LLM fills every field (empty when unused), and switching a scene's type in
 * the editor keeps what was typed. Which fields a type shows is in SCENE_TYPES.
 */
export interface ExplainerScene {
  type: SceneType
  /** Small line above the heading: a category, "Langkah 2", the rank of a fact ("#3"). */
  label: string
  /** Main text; for a quote, the quote itself. */
  heading: string
  body: string
  /** Step or tip number, or the big figure of a fact ("73%", "1,4 juta"). */
  value: string
  /** One emoji for tips. */
  icon: string
  codeKind: CodeKind
  codeLanguage: string
  code: string
  /** Who said a quote, or the source of a fact. */
  author: string
  /** Compare scenes: column titles. A-vs-B scenes: the names of option A and B. */
  leftTitle: string
  /** Compare scenes: items per column. Versus: facts per option. Pros/cons: pros (left) and cons (right). Points: the list. */
  left: string[]
  rightTitle: string
  right: string[]
  /** Versus scenes: the big figure or rating of each option ("Rp350 rb", "8/10"). */
  leftValue: string
  rightValue: string
  /** The winner of a round or of the verdict, or the option a pros/cons scene is about. */
  side: SceneSide
  imageMode: SceneImageMode
  /** What the AI image shows (English), when imageMode is "ai". */
  imagePrompt: string
  highlight: SceneHighlight | null
}

export type SceneField = 'label' | 'heading' | 'body' | 'value' | 'icon' | 'code' | 'author' | 'compare' | 'image' | 'values' | 'side' | 'list'

export const SCENE_TYPES: { id: SceneType; name: string; fields: SceneField[] }[] = [
  { id: 'title', name: 'Judul', fields: ['label', 'heading', 'body', 'image'] },
  { id: 'step', name: 'Langkah', fields: ['value', 'label', 'heading', 'body', 'code', 'image'] },
  { id: 'tip', name: 'Tips', fields: ['value', 'icon', 'heading', 'body', 'image'] },
  { id: 'fact', name: 'Fakta', fields: ['label', 'value', 'heading', 'body', 'author', 'image'] },
  { id: 'quote', name: 'Kutipan', fields: ['heading', 'author', 'body', 'image'] },
  { id: 'compare', name: 'Perbandingan', fields: ['heading', 'compare'] },
  { id: 'outro', name: 'Penutup', fields: ['label', 'heading', 'body'] },
  { id: 'versus', name: 'Ronde', fields: ['label', 'heading', 'values', 'compare', 'side'] },
  { id: 'proscons', name: 'Plus minus', fields: ['heading', 'side', 'compare'] },
  { id: 'verdict', name: 'Putusan', fields: ['label', 'heading', 'body', 'side', 'compare'] },
  { id: 'headline', name: 'Berita', fields: ['label', 'heading', 'body', 'value', 'author', 'image'] },
  { id: 'points', name: 'Poin penting', fields: ['label', 'heading', 'list'] }
]

export const sceneTypeName = (t: SceneType): string => SCENE_TYPES.find((s) => s.id === t)?.name ?? t
export const sceneHas = (t: SceneType, f: SceneField): boolean => !!SCENE_TYPES.find((s) => s.id === t)?.fields.includes(f)

/** Whether a scene's layout shows a picture in this template; the A-vs-B title draws the two names instead. */
export const sceneShowsImage = (templateId: string | null | undefined, t: SceneType): boolean => sceneHas(t, 'image') && !(templateId === 'compare' && t === 'title')

/** A scene that should get an AI picture: it asks for one and its layout can show one (an outro cannot). */
export const wantsAiImage = (scene: ExplainerScene | null | undefined): boolean => !!scene && scene.imageMode === 'ai' && sceneHas(scene.type, 'image')

// ---------- look: palettes and fonts ----------

export interface ExplainerPalette {
  id: string
  name: string
  bg: string
  /** Cards, code windows. */
  surface: string
  ink: string
  muted: string
  accent: string
  accent2: string
  dark: boolean
}

export interface ExplainerFont {
  id: string
  name: string
  family: string
  /** File in resources/fonts. */
  file: string
  weight: number
  /** Condensed display faces read better in capitals. */
  upper: boolean
  /** Visual size correction, so a narrow face is not tiny next to a wide one. */
  scale: number
}

export const EXPLAINER_FONTS: ExplainerFont[] = [
  { id: 'poppins', name: 'Poppins', family: 'Poppins', file: 'Poppins-ExtraBold.ttf', weight: 800, upper: false, scale: 1 },
  { id: 'archivo', name: 'Archivo Black', family: 'Archivo Black', file: 'ArchivoBlack-Regular.ttf', weight: 400, upper: false, scale: 0.98 },
  { id: 'bebas', name: 'Bebas Neue', family: 'Bebas Neue', file: 'BebasNeue-Regular.ttf', weight: 400, upper: true, scale: 1.32 },
  { id: 'anton', name: 'Anton', family: 'Anton', file: 'Anton-Regular.ttf', weight: 400, upper: true, scale: 1.12 },
  { id: 'dmserif', name: 'DM Serif Display', family: 'DM Serif Display', file: 'DMSerifDisplay-Regular.ttf', weight: 400, upper: false, scale: 1.08 },
  { id: 'lilita', name: 'Lilita One', family: 'Lilita One', file: 'LilitaOne-Regular.ttf', weight: 400, upper: false, scale: 1.06 }
]

/** Body text and code: Poppins weights and JetBrains Mono, always loaded. */
const BASE_FONTS: { family: string; file: string; weight: number }[] = [
  { family: 'Poppins', file: 'Poppins-Medium.ttf', weight: 500 },
  { family: 'Poppins', file: 'Poppins-SemiBold.ttf', weight: 600 },
  { family: 'Poppins', file: 'Poppins-Bold.ttf', weight: 700 },
  { family: 'Poppins', file: 'Poppins-ExtraBold.ttf', weight: 800 },
  { family: 'JetBrains Mono', file: 'JetBrainsMono-Variable.woff2', weight: 400 },
  { family: 'JetBrains Mono', file: 'JetBrainsMono-Variable.woff2', weight: 700 }
]

export const getExplainerFont = (id: string | undefined): ExplainerFont => EXPLAINER_FONTS.find((f) => f.id === id) ?? EXPLAINER_FONTS[0]

// ---------- captions ----------

export type CaptionStyleId = 'box' | 'karaoke' | 'minimal' | 'bold'
export type CaptionPosition = 'bottom' | 'middle' | 'top'

/**
 * Burned-in caption looks. `maxWords`/`maxChars` set how the narration is cut into lines: the big short-form
 * style shows two or three words at a time, the small one a whole phrase.
 */
export const CAPTION_STYLES: { id: CaptionStyleId; name: string; blurb: string; maxWords: number; maxChars: number }[] = [
  { id: 'box', name: 'Kotak', blurb: 'Kotak gelap, kata yang sedang diucapkan menyala', maxWords: 5, maxChars: 30 },
  { id: 'karaoke', name: 'Karaoke', blurb: 'Warna mengisi kata demi kata mengikuti suara', maxWords: 6, maxChars: 32 },
  { id: 'minimal', name: 'Minimal', blurb: 'Kecil dan tenang, tanpa kotak', maxWords: 8, maxChars: 44 },
  { id: 'bold', name: 'Besar', blurb: 'Dua-tiga kata besar dan tebal ala Shorts', maxWords: 3, maxChars: 16 }
]

export const CAPTION_POSITIONS: { id: CaptionPosition; name: string }[] = [
  { id: 'bottom', name: 'Bawah' },
  { id: 'middle', name: 'Tengah' },
  { id: 'top', name: 'Atas' }
]

export interface ExplainerCaption {
  style: CaptionStyleId
  position: CaptionPosition
}

export const getCaptionStyle = (id: CaptionStyleId) => CAPTION_STYLES.find((c) => c.id === id) ?? CAPTION_STYLES[0]

// ---------- templates ----------

export interface ExplainerTemplate {
  id: ExplainerTemplateId
  name: string
  /** One line for the picker. */
  blurb: string
  sceneTypes: SceneType[]
  /** The type new scenes get in the editor. */
  mainType: SceneType
  palettes: ExplainerPalette[]
  /** Heading fonts a user can pick; the first is the default. */
  fonts: string[]
  /** Big numbers (step, tip, fact figures). */
  numberFont: string
  /** Caption look until the user picks another one. */
  captionStyle: CaptionStyleId
  /** Color of the spoken word in captions: a palette color or a fixed one (#RRGGBB). */
  captionLit: 'accent' | 'accent2' | 'bg' | `#${string}`
  /** Instructions for the LLM, in English. */
  guidance: string
}

export const EXPLAINER_TEMPLATES: ExplainerTemplate[] = [
  {
    id: 'tutorial',
    name: 'Tutorial langkah demi langkah',
    blurb: 'Cara melakukan sesuatu, satu langkah per adegan, dengan kode atau screenshot.',
    sceneTypes: ['title', 'step', 'compare', 'outro'],
    mainType: 'step',
    palettes: [
      { id: 'malam', name: 'Malam', bg: '#0E1116', surface: '#171C24', ink: '#F2F5F9', muted: '#8C97A8', accent: '#7CF29C', accent2: '#5AA9FF', dark: true },
      { id: 'kertas', name: 'Kertas', bg: '#F4F0E8', surface: '#FFFFFF', ink: '#15171C', muted: '#5D6470', accent: '#2E5BFF', accent2: '#FF7A1A', dark: false },
      { id: 'anggur', name: 'Anggur', bg: '#160F29', surface: '#221A3F', ink: '#F5F0FF', muted: '#A79CC8', accent: '#FFC93C', accent2: '#FF6B9A', dark: true },
      { id: 'laut', name: 'Laut', bg: '#EEF4FB', surface: '#FFFFFF', ink: '#0F1B2D', muted: '#5A6B82', accent: '#0A84FF', accent2: '#00A47A', dark: false },
      { id: 'terminal', name: 'Terminal', bg: '#0F0B05', surface: '#1C150B', ink: '#FFE8C2', muted: '#B29B76', accent: '#FFB000', accent2: '#FF5F56', dark: true },
      { id: 'korporat', name: 'Korporat', bg: '#F4F6FA', surface: '#FFFFFF', ink: '#0E1A2B', muted: '#5B6779', accent: '#1F4FD8', accent2: '#0EA5A4', dark: false }
    ],
    fonts: ['poppins', 'archivo', 'bebas'],
    numberFont: 'mono',
    captionStyle: 'box',
    captionLit: 'accent',
    guidance: [
      'A practical how-to video. Scene 1 is "title": label = the topic area, heading = what the viewer will be able to do (max 8 words), body = the end result in one short line.',
      'Then one "step" scene per action, in the real order. value = the step number ("1", "2", ...), label = "" , heading = the instruction in the imperative (max 7 words), body = the detail or the why (max 18 words).',
      'When a step is done in a terminal or in code, put the exact command or snippet in code (max 7 short lines, real and correct syntax), codeKind "terminal" for shell commands or "code" for source code, codeLanguage e.g. "bash", "python", "javascript". Otherwise codeKind "none" and code "".',
      'When a screenshot of the viewer\'s own screen (an app, a settings page, a website) would show the step best, set imageMode "upload" and imagePrompt "" (the user adds the screenshot). Use imageMode "ai" only for a conceptual illustration, at most once. Steps with code use imageMode "none".',
      'Optionally one "compare" scene (do vs. don\'t, before vs. after) with 2-4 short items per side.',
      'The last scene is "outro": heading = a short recap or call to action, body = one line.'
    ].join('\n')
  },
  {
    id: 'tips',
    name: 'Tips & trik',
    blurb: 'Listicle “N tips …”: angka besar, emoji, dan poin yang langsung kena.',
    sceneTypes: ['title', 'tip', 'compare', 'outro'],
    mainType: 'tip',
    palettes: [
      { id: 'kuning', name: 'Kuning', bg: '#FFD23F', surface: '#FFFFFF', ink: '#151515', muted: '#4B4221', accent: '#FF4D2E', accent2: '#2B59FF', dark: false },
      { id: 'mint', name: 'Mint', bg: '#BDF0D3', surface: '#FFFFFF', ink: '#0F2419', muted: '#3C5A4A', accent: '#FF5C39', accent2: '#6B4BFF', dark: false },
      { id: 'arang', name: 'Arang', bg: '#171717', surface: '#262626', ink: '#FFF6E5', muted: '#B3AA99', accent: '#FFD23F', accent2: '#FF4D2E', dark: true },
      { id: 'persik', name: 'Persik', bg: '#FFD9C2', surface: '#FFFFFF', ink: '#2A1408', muted: '#6E4A35', accent: '#E63946', accent2: '#1D63F5', dark: false },
      { id: 'lavender', name: 'Lavender', bg: '#D9CCFF', surface: '#FFFFFF', ink: '#1A1036', muted: '#4F4475', accent: '#FF4F87', accent2: '#00A884', dark: false }
    ],
    fonts: ['archivo', 'poppins', 'lilita'],
    numberFont: 'anton',
    captionStyle: 'box',
    captionLit: 'bg',
    guidance: [
      'A listicle ("5 tips to ..."). Scene 1 is "title": heading states the promise with the count (max 8 words), label = the topic, body = one short teaser line.',
      'Then one "tip" scene per tip. value = its number counting up ("1", "2", ...), icon = one fitting emoji, heading = the tip itself (max 6 words), body = how or why (max 16 words).',
      'Set imageMode "ai" with a concrete, visual imagePrompt for at most a third of the tips where a picture really helps; the others imageMode "none" and imagePrompt "".',
      'Optionally one "compare" scene (wrong vs. right) with 2-4 short items per side.',
      'The last scene is "outro": heading = a short call to action, body = one line.'
    ].join('\n')
  },
  {
    id: 'facts',
    name: 'Fakta / countdown',
    blurb: 'Hitung mundur fakta mengejutkan dengan angka besar yang dramatis.',
    sceneTypes: ['title', 'fact', 'compare', 'outro'],
    mainType: 'fact',
    palettes: [
      { id: 'bioskop', name: 'Bioskop', bg: '#0B0B0C', surface: '#18181B', ink: '#F5F5F4', muted: '#A1A1AA', accent: '#FF3B30', accent2: '#FFB800', dark: true },
      { id: 'samudra', name: 'Samudra', bg: '#04182B', surface: '#0B2742', ink: '#E8F4FF', muted: '#86A8C7', accent: '#00D1FF', accent2: '#FFD166', dark: true },
      { id: 'arsip', name: 'Arsip', bg: '#EFE7DA', surface: '#FFFBF4', ink: '#1A1714', muted: '#6E6458', accent: '#D7261E', accent2: '#1F6FEB', dark: false },
      { id: 'magma', name: 'Magma', bg: '#140805', surface: '#24100A', ink: '#FFF1E8', muted: '#C2A08F', accent: '#FF6A2B', accent2: '#FFD166', dark: true },
      { id: 'es', name: 'Es', bg: '#E9F1F5', surface: '#FFFFFF', ink: '#0B1D26', muted: '#557080', accent: '#0077B6', accent2: '#E63946', dark: false }
    ],
    fonts: ['bebas', 'anton', 'archivo'],
    numberFont: 'bebas',
    captionStyle: 'karaoke',
    captionLit: 'accent2',
    guidance: [
      'A countdown of surprising, true facts. Scene 1 is "title": heading = the hook (max 8 words), label = the topic, body = one teaser line.',
      'Then one "fact" scene per fact, counting down: label = the rank ("#5", "#4", ... "#1"). value = the single most striking figure of the fact, short ("73%", "1,6 juta", "1912", "8 menit"); if the fact has no figure, a 1-2 word keyword. heading = the fact in max 9 words, body = context in max 18 words, author = the source if well known, else "".',
      'Only state facts you are confident are accurate. Put the most surprising fact at #1.',
      'Set imageMode "ai" with a vivid, concrete, photographic imagePrompt for most facts (no text, numbers or logos in the picture); imageMode "none" otherwise.',
      'The last scene is "outro": heading = a question or call to action, body = one line.'
    ].join('\n')
  },
  {
    id: 'quote',
    name: 'Kutipan / motivasi',
    blurb: 'Kutipan tokoh dengan tipografi elegan dan narasi yang menenangkan.',
    sceneTypes: ['title', 'quote', 'tip', 'outro'],
    mainType: 'quote',
    palettes: [
      { id: 'hutan', name: 'Hutan', bg: '#11241E', surface: '#1A332B', ink: '#F3EBDD', muted: '#A9BDB2', accent: '#E9B44C', accent2: '#8FC0A9', dark: true },
      { id: 'senja', name: 'Senja', bg: '#2A1B3D', surface: '#3A2652', ink: '#FCE9DA', muted: '#C9B2C9', accent: '#FF8C61', accent2: '#F4C95D', dark: true },
      { id: 'linen', name: 'Linen', bg: '#F3EDE2', surface: '#FFFFFF', ink: '#2B2522', muted: '#76695F', accent: '#B5452F', accent2: '#3F6E5A', dark: false },
      { id: 'fajar', name: 'Fajar', bg: '#FFF3E4', surface: '#FFFFFF', ink: '#2D1E14', muted: '#8A6E5A', accent: '#D9692A', accent2: '#B5466B', dark: false },
      { id: 'tinta', name: 'Tinta', bg: '#0D0D0D', surface: '#1A1A1A', ink: '#F2F2F2', muted: '#9B9B9B', accent: '#E8E1D2', accent2: '#C9A86A', dark: true }
    ],
    fonts: ['dmserif', 'poppins', 'bebas'],
    numberFont: 'dmserif',
    captionStyle: 'minimal',
    captionLit: 'accent',
    guidance: [
      'A calm motivational video built on quotes. Scene 1 is "title": heading = the theme (max 6 words), label = a short category, body = one line.',
      'Then mostly "quote" scenes: heading = the quote (max 22 words), author = who said it. Only use real quotes you are sure of, worded correctly and correctly attributed; if unsure, write an original line and set author "". body = a one-line reflection.',
      'The narration of a quote scene reads the quote, names the author, then adds the reflection.',
      'You may add one "tip" scene with a practical takeaway (value "", icon one emoji).',
      'Set imageMode "ai" for a few scenes with a calm, atmospheric imagePrompt (landscapes, light, textures; no people facing the camera, no text); otherwise "none".',
      'The last scene is "outro": heading = an encouraging closing line, body = one line.'
    ].join('\n')
  },
  {
    id: 'compare',
    name: 'Perbandingan (A vs B)',
    blurb: 'Adu dua pilihan ronde demi ronde: layar terbelah, skor, plus minus, dan putusan.',
    sceneTypes: ['title', 'versus', 'proscons', 'verdict', 'outro'],
    mainType: 'versus',
    palettes: [
      { id: 'arena', name: 'Arena', bg: '#0E0F1A', surface: '#181A2B', ink: '#F5F5FA', muted: '#9A9CB8', accent: '#FF4D6D', accent2: '#2EC8FF', dark: true },
      { id: 'poster', name: 'Poster', bg: '#F1ECE2', surface: '#FFFFFF', ink: '#15151C', muted: '#66636E', accent: '#E8452C', accent2: '#2457E6', dark: false },
      { id: 'neon', name: 'Neon', bg: '#0C110D', surface: '#162018', ink: '#EEF6EA', muted: '#91A38F', accent: '#B8F23A', accent2: '#B06CFF', dark: true },
      { id: 'kontras', name: 'Kontras', bg: '#FFFFFF', surface: '#F2F2F5', ink: '#111111', muted: '#5E5E66', accent: '#FF2E63', accent2: '#0BB8B5', dark: false },
      { id: 'retro', name: 'Retro', bg: '#1E1B2E', surface: '#2A2640', ink: '#FFF8E7', muted: '#B8B0CF', accent: '#FF9F1C', accent2: '#2EC4B6', dark: true },
      { id: 'korporat', name: 'Korporat', bg: '#F4F6FA', surface: '#FFFFFF', ink: '#0E1A2B', muted: '#5B6779', accent: '#1F4FD8', accent2: '#0EA5A4', dark: false }
    ],
    fonts: ['anton', 'bebas', 'archivo'],
    numberFont: 'anton',
    captionStyle: 'box',
    captionLit: '#FFD84D',
    guidance: [
      'A fair head-to-head comparison of exactly two options, A versus B. Pick A and B from the topic. In EVERY scene put the name of A in leftTitle and the name of B in rightTitle (1-2 words each, the same spelling every time).',
      'Scene 1 is "title": heading = the question the video answers (max 8 words), label = the topic area (1-2 words), body = one teaser line (max 10 words).',
      'Then 3-5 "versus" scenes, one per aspect (price, speed, comfort, ...): label = the aspect in 1-2 words, heading = the question of this round (max 7 words), leftValue and rightValue = one short figure or rating per option when a reliable one exists ("Rp350 rb", "2 jam", "8/10"), else "", left and right = 1-3 short facts about A and about B for this aspect (max 5 words each), side = the option that wins this round ("left" for A, "right" for B, "both" for a tie).',
      'Optionally one "proscons" scene per option: side = which option ("left" or "right"), heading = a 3-6 word summary of that option, left = 2-3 pros, right = 2-3 cons (max 5 words each).',
      'Then one "verdict" scene: label = a 1-2 word stamp such as "Pemenang", side = the overall winner ("left" or "right", "both" only when it truly depends), heading = the verdict (max 8 words), body = why (max 18 words), left = 1-2 situations to choose A, right = 1-2 situations to choose B (max 6 words each).',
      'The last scene is "outro": heading = a question or call to action, body = one line.',
      'Be fair and accurate. Only give figures you are confident about; otherwise compare in words and leave the values "". All scenes use imageMode "none".'
    ].join('\n')
  },
  {
    id: 'news',
    name: 'Berita / rangkuman cepat',
    blurb: 'Gaya meja berita: kartu judul, lower third, poin penting, tanggal dan sumber.',
    sceneTypes: ['title', 'headline', 'points', 'fact', 'quote', 'outro'],
    mainType: 'headline',
    palettes: [
      { id: 'studio', name: 'Studio', bg: '#0A1322', surface: '#132139', ink: '#F2F5FA', muted: '#8DA0BC', accent: '#E3262E', accent2: '#F6C518', dark: true },
      { id: 'koran', name: 'Koran', bg: '#F3F0E8', surface: '#FFFFFF', ink: '#111317', muted: '#5D646E', accent: '#D21F26', accent2: '#0B57D0', dark: false },
      { id: 'malam', name: 'Malam', bg: '#101010', surface: '#1B1B1B', ink: '#FAFAFA', muted: '#A1A1A1', accent: '#FF5A1F', accent2: '#2CC5B4', dark: true },
      { id: 'pagi', name: 'Pagi', bg: '#F5F7FA', surface: '#FFFFFF', ink: '#0B1220', muted: '#5B6475', accent: '#0057FF', accent2: '#FFB800', dark: false },
      { id: 'pasar', name: 'Pasar', bg: '#071A12', surface: '#0E2A1E', ink: '#EAF7F0', muted: '#8FB3A2', accent: '#00C46A', accent2: '#F4C430', dark: true },
      { id: 'korporat', name: 'Korporat', bg: '#F4F6FA', surface: '#FFFFFF', ink: '#0E1A2B', muted: '#5B6779', accent: '#1F4FD8', accent2: '#0EA5A4', dark: false }
    ],
    fonts: ['archivo', 'anton', 'poppins'],
    numberFont: 'bebas',
    captionStyle: 'box',
    captionLit: 'accent2',
    guidance: [
      'A quick news roundup in a news-desk style, built only from the topic text. Summarize what the topic text says plus well-established background; never invent events, numbers, quotes, names, dates or sources. When the topic gives a date or a source, use it; otherwise leave value and author "".',
      'Scene 1 is "title": label = the desk or category (1-2 words, e.g. "Tekno", "Ekonomi"), heading = the main headline (max 9 words), body = a one-line standfirst (max 16 words), value = the date of the news when known (short, e.g. "29 Okt 2026"), else "", author = the main source when known, else "".',
      'Then one "headline" scene per news item (3-5 items): label = its category (1-2 words), heading = the headline (max 9 words), body = the summary (max 22 words), author = its source when known, value = its date when known.',
      'Then one "points" scene, also in a short video (drop a headline rather than this scene): heading = a short title such as "Poin penting", left = 3-5 key takeaways (max 8 words each), label = "".',
      'Optionally one "fact" scene for the most striking figure: value = the figure, heading = what it means (max 9 words), author = its source. Optionally one "quote" scene for a real, verifiable statement: heading = the quote, author = who said it; skip it when unsure.',
      'Use imageMode "ai" with a concrete, photographic imagePrompt for most headline scenes (no text, logos, maps with labels or faces of real people); otherwise imageMode "none".',
      'The last scene is "outro": heading = a short sign-off or question, body = one line.'
    ].join('\n')
  }
]

export function getTemplate(id: string | null | undefined): ExplainerTemplate {
  return EXPLAINER_TEMPLATES.find((t) => t.id === id) ?? EXPLAINER_TEMPLATES[0]
}

/** What a user changed about a template's look; unset fields keep the template's own. */
export interface ExplainerTheme {
  paletteId?: string
  /** Custom accent color (#RRGGBB) on top of the palette. */
  accent?: string
  /** Heading font id from EXPLAINER_FONTS. */
  fontId?: string
  /** Logo shown in a corner (an overlay asset). */
  logoAssetId?: string | null
  /** Burned-in captions of the narration; on unless switched off. */
  captions?: boolean
  /** Caption look; unset = the template's own. */
  captionStyle?: CaptionStyleId
  /** Where captions sit; unset = bottom. */
  captionPosition?: CaptionPosition
  /** Look of AI pictures (EXPLAINER_IMAGE_STYLES); unset or 'auto' = the template's own look. */
  imageStyleId?: string
}

export interface ExplainerLook {
  templateId: ExplainerTemplateId
  palette: ExplainerPalette
  heading: ExplainerFont
  number: ExplainerFont | { id: 'mono'; family: string; upper: false; scale: number; weight: number }
}

const HEX = /^#[0-9a-f]{6}$/i

export function resolveLook(templateId: string | null | undefined, theme: ExplainerTheme | undefined): ExplainerLook {
  const t = getTemplate(templateId)
  const base = t.palettes.find((p) => p.id === theme?.paletteId) ?? t.palettes[0]
  const palette = theme?.accent && HEX.test(theme.accent) ? { ...base, accent: theme.accent } : base
  const heading = getExplainerFont(theme?.fontId && EXPLAINER_FONTS.some((f) => f.id === theme.fontId) ? theme.fontId : t.fonts[0])
  const number = t.numberFont === 'mono' ? ({ id: 'mono', family: 'JetBrains Mono', upper: false, scale: 0.92, weight: 700 } as const) : getExplainerFont(t.numberFont)
  return { templateId: t.id, palette, heading, number }
}

export function resolveCaption(templateId: string | null | undefined, theme: ExplainerTheme | undefined): ExplainerCaption {
  const t = getTemplate(templateId)
  return {
    style: CAPTION_STYLES.some((c) => c.id === theme?.captionStyle) ? theme!.captionStyle! : t.captionStyle,
    position: CAPTION_POSITIONS.some((c) => c.id === theme?.captionPosition) ? theme!.captionPosition! : 'bottom'
  }
}

/** Font files a look needs, for the composition's font loader. */
export function lookFonts(look: ExplainerLook): { family: string; file: string; weight: number }[] {
  const out = [...BASE_FONTS]
  for (const f of [look.heading, look.number]) {
    if ('file' in f && !out.some((x) => x.family === f.family && x.weight === f.weight)) out.push({ family: f.family, file: f.file, weight: f.weight })
  }
  return out
}

// ---------- scenes: defaults and LLM output ----------

export function emptyScene(type: SceneType = 'step'): ExplainerScene {
  return {
    type,
    label: '',
    heading: '',
    body: '',
    value: '',
    icon: '',
    codeKind: 'none',
    codeLanguage: '',
    code: '',
    author: '',
    leftTitle: '',
    left: [],
    rightTitle: '',
    right: [],
    leftValue: '',
    rightValue: '',
    side: 'none',
    imageMode: 'none',
    imagePrompt: '',
    highlight: null
  }
}

const str = (v: unknown, max = 400): string => (typeof v === 'string' ? v.replace(/\s+$/g, '').trim().slice(0, max) : '')
const oneOf = <T extends string>(v: unknown, all: readonly T[], fallback: T): T => (all.includes(v as T) ? (v as T) : fallback)
const list = (v: unknown): string[] =>
  (Array.isArray(v) ? v : typeof v === 'string' ? v.split('\n') : [])
    .map((x) => str(x, 80))
    .filter(Boolean)
    .slice(0, 5)
const clamp01 = (n: unknown): number => Math.min(1, Math.max(0, Number(n) || 0))

/**
 * Brings a scene from the LLM, the database or an old build to the current shape. `allowed` limits the
 * type to the template's scene types; anything else becomes `fallback` (the template's main type).
 */
export function normalizeScene(raw: unknown, allowed?: SceneType[], fallback?: SceneType): ExplainerScene {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const types = allowed?.length ? allowed : SCENE_TYPES.map((s) => s.id)
  const type = oneOf(r.type, types, fallback && types.includes(fallback) ? fallback : types.includes('step') ? 'step' : types[0])
  const h = r.highlight as Record<string, unknown> | null | undefined
  const highlight =
    h && typeof h === 'object' && Number(h.w) > 0.01 && Number(h.h) > 0.01
      ? { x: clamp01(h.x), y: clamp01(h.y), w: Math.min(clamp01(h.w), 1 - clamp01(h.x)), h: Math.min(clamp01(h.h), 1 - clamp01(h.y)) }
      : null
  const code = typeof r.code === 'string' ? r.code.replace(/\r\n/g, '\n').replace(/\s+$/, '').slice(0, 1200) : ''
  const codeKind = code ? oneOf(r.codeKind, ['none', 'code', 'terminal'] as const, 'code') : 'none'
  return {
    type,
    label: str(r.label, 60),
    heading: str(r.heading, 240),
    body: str(r.body, 400),
    value: str(r.value, 24),
    icon: str(r.icon, 16),
    codeKind: codeKind === 'none' && code ? 'code' : codeKind,
    codeLanguage: str(r.codeLanguage, 24).toLowerCase(),
    code,
    author: str(r.author, 80),
    leftTitle: str(r.leftTitle, 40),
    left: list(r.left),
    rightTitle: str(r.rightTitle, 40),
    right: list(r.right),
    leftValue: str(r.leftValue, 24),
    rightValue: str(r.rightValue, 24),
    side: oneOf(r.side, ['none', 'left', 'right', 'both'] as const, 'none'),
    imageMode: oneOf(r.imageMode, ['none', 'upload', 'ai'] as const, 'none'),
    imagePrompt: str(r.imagePrompt, 600),
    highlight
  }
}

/** A scene stored in clips.scene_json, or null for story clips. */
export function parseScene(json: string | null | undefined): ExplainerScene | null {
  if (!json) return null
  try {
    const v = JSON.parse(json)
    return v && typeof v === 'object' && typeof v.type === 'string' ? normalizeScene(v) : null
  } catch {
    return null
  }
}

/** About one scene per 7 seconds: long enough for a heading, a sentence and a beat to read it. */
export function explainerSceneCount(durationSec: number): number {
  return Math.max(4, Math.min(40, Math.round(durationSec / 7)))
}

export interface ExplainerImageStyle {
  id: string
  name: string
  /** One line for the picker. */
  blurb: string
  /** Tile colors in the picker. */
  swatch: string
  ink: string
  /** Style line of the image prompt; empty for 'auto' (the template's own look). */
  prompt: string
}

/** Looks for the AI pictures of an explainer, chosen per project on top of the template. */
export const EXPLAINER_IMAGE_STYLES: ExplainerImageStyle[] = [
  { id: 'auto', name: 'Otomatis', blurb: 'Mengikuti template', swatch: '#F3EFE8', ink: '#1F1D1A', prompt: '' },
  {
    id: 'flat',
    name: 'Ilustrasi flat',
    blurb: 'Bentuk sederhana, warna rapi',
    swatch: '#8CCBE3',
    ink: '#1F1D1A',
    prompt: 'Clean modern flat vector illustration, simple geometric shapes, a limited harmonious palette, soft shading, plenty of empty space.'
  },
  {
    id: 'isometric',
    name: 'Isometrik 3D',
    blurb: 'Teknologi, proses, sistem',
    swatch: '#B9C6FF',
    ink: '#1F1D1A',
    prompt: 'Isometric 3D illustration of tidy geometric objects on a simple base, soft pastel colors, gentle shadows, clean tech-explainer look.'
  },
  {
    id: 'icon3d',
    name: 'Ikon 3D',
    blurb: 'Objek 3D mengilap, ceria',
    swatch: '#FFB4C8',
    ink: '#1F1D1A',
    prompt: 'Glossy 3D rendered icon-style objects with soft rounded shapes like smooth plastic, vibrant colors, soft studio lighting, simple gradient background.'
  },
  {
    id: 'lineart',
    name: 'Line art minimal',
    blurb: 'Garis tipis, banyak ruang',
    swatch: '#FAF7F2',
    ink: '#1F1D1A',
    prompt: 'Minimal single-weight line art illustration, dark lines on an off-white background with one accent color, lots of empty space.'
  },
  {
    id: 'doodle',
    name: 'Doodle tangan',
    blurb: 'Coretan spidol, santai',
    swatch: '#FFFFFF',
    ink: '#1F1D1A',
    prompt: 'Hand-drawn marker doodle on white paper, sketchy lines, arrows and small icons, one accent color, a friendly whiteboard explainer look.'
  },
  {
    id: 'papercut',
    name: 'Papercut berlapis',
    blurb: 'Kertas bertumpuk, hangat',
    swatch: '#F2B266',
    ink: '#1F1D1A',
    prompt: 'Layered papercut illustration, stacked paper shapes with soft drop shadows that give depth, a warm limited palette, handcrafted texture.'
  },
  {
    id: 'watercolor',
    name: 'Cat air',
    blurb: 'Lembut dan tenang',
    swatch: '#C9DDE8',
    ink: '#1F1D1A',
    prompt: 'Soft watercolor illustration, gentle washes of color, visible paper texture, a calm and airy composition.'
  },
  {
    id: 'clay',
    name: 'Claymation',
    blurb: 'Plastisin buatan tangan',
    swatch: '#F4A988',
    ink: '#1F1D1A',
    prompt: 'Claymation style scene of handcrafted plasticine objects and characters, visible clay texture, soft studio lighting, a simple backdrop.'
  },
  {
    id: 'neon',
    name: 'Neon futuristik',
    blurb: 'Gelap, cahaya menyala',
    swatch: '#1B1035',
    ink: '#7CF2E8',
    prompt: 'Futuristic neon illustration on a dark background, glowing cyan and magenta light lines, a sleek technology look, a subtle grid.'
  },
  {
    id: 'blueprint',
    name: 'Blueprint teknik',
    blurb: 'Diagram teknis, rekayasa',
    swatch: '#1E4E8C',
    ink: '#E6F0FF',
    prompt:
      'Technical blueprint illustration: white and light-cyan line drawings on a deep blue grid background, a precise engineering diagram look with cross-sections, exploded views and callout circles.'
  },
  {
    id: 'photo',
    name: 'Foto realistis',
    blurb: 'Natural dan jelas',
    swatch: '#8A9A7B',
    ink: '#FAF7F2',
    prompt: 'Realistic high-quality photograph, natural light, sharp focus, true-to-life colors, a simple uncluttered composition.'
  },
  {
    id: 'cinematic',
    name: 'Foto sinematik',
    blurb: 'Dramatis, kontras',
    swatch: '#3C4258',
    ink: '#FAF7F2',
    prompt: 'Dramatic cinematic photograph, strong directional lighting, rich color grading, shallow depth of field.'
  }
]

export function getExplainerImageStyle(id: string | undefined): ExplainerImageStyle {
  return EXPLAINER_IMAGE_STYLES.find((s) => s.id === id) ?? EXPLAINER_IMAGE_STYLES[0]
}

/** The AI image prompt for a scene: its own description plus the chosen look (or the template's), never text. */
export function explainerImagePrompt(project: Pick<Project, 'templateId' | 'theme'>, scene: ExplainerScene): string {
  const look: Record<ExplainerTemplateId, string> = {
    tutorial: 'Clean modern flat illustration, soft shading, simple shapes, plenty of empty space.',
    tips: 'Bold, playful editorial illustration with clean shapes and bright colors, simple background.',
    facts: 'Dramatic cinematic photograph, high detail, strong lighting, shallow depth of field.',
    quote: 'Calm atmospheric photograph, soft natural light, gentle colors, lots of negative space.',
    compare: 'Clean product-style photograph on a plain backdrop, even studio lighting.',
    news: 'Editorial news photograph, natural light, realistic, documentary style, no recognizable faces.'
  }
  const chosen = getExplainerImageStyle(project.theme?.imageStyleId).prompt
  const subject = scene.imagePrompt.trim() || [scene.heading, scene.body].filter(Boolean).join('. ')
  return [
    `Subject: ${subject}`,
    `Style: ${chosen || look[getTemplate(project.templateId).id]}`,
    'Landscape 16:9 frame. No text, letters, numbers, captions, watermarks or logos anywhere in the image.'
  ].join('\n\n')
}

// ---------- timing ----------

export const EXPLAINER_FPS = 30
/** The scene animates in before its voice starts, and holds a moment after the voice ends. */
export const SCENE_LEAD_MS = 450
export const SCENE_TAIL_MS = 700
export const MIN_SCENE_MS = 2500

export function explainerSize(aspect: AspectRatio): { width: number; height: number } {
  return aspect === '9:16' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 }
}

type AssetLookup = Record<string, Asset | undefined>

/** How long a scene lasts: its voice plus the lead-in and hold, or its own length before it has a voice. */
export function sceneDurationMs(clip: Pick<Clip, 'durationMs' | 'audioAssetId'>, assets: AssetLookup): number {
  const audio = clip.audioAssetId ? assets[clip.audioAssetId] : undefined
  if (audio?.durationMs) return Math.max(MIN_SCENE_MS, SCENE_LEAD_MS + audio.durationMs + SCENE_TAIL_MS)
  return Math.max(MIN_SCENE_MS, clip.durationMs)
}

/** Start and length (ms) of every scene on the video timeline. */
export function explainerTimeline(clips: Clip[], assets: AssetLookup): { clipId: string; startMs: number; durationMs: number }[] {
  let t = 0
  return clips.map((c) => {
    const d = sceneDurationMs(c, assets)
    const out = { clipId: c.id, startMs: t, durationMs: d }
    t += d
    return out
  })
}

// ---------- composition input (Player and render) ----------

export interface ExplainerSceneInput {
  id: string
  scene: ExplainerScene
  from: number
  frames: number
  audio: { src: string; startFrame: number; frames: number; volume: number } | null
  image: { src: string; width: number; height: number } | null
  /** Caption words in seconds from the scene's start. */
  words: WordTiming[]
}

export type ExplainerInput = {
  templateId: ExplainerTemplateId
  title: string
  width: number
  height: number
  fps: number
  totalFrames: number
  look: ExplainerLook
  captions: boolean
  caption: ExplainerCaption
  fontBase: string
  logo: string | null
  scenes: ExplainerSceneInput[]
  music: { src: string; volume: number; duck: boolean; trimBeforeFrames: number } | null
}

const dbToGain = (db: number): number => Math.pow(10, db / 20)

/** A project file's URL under a base: studio://asset/<project>/ in the app, the render's asset server in an export. */
function fileUrl(base: string, localPath: string): string {
  return base + localPath.split(/[\\/]/).map(encodeURIComponent).join('/')
}

export function buildExplainerInput(args: {
  project: Pick<Project, 'title' | 'templateId' | 'theme' | 'aspectRatio' | 'editor'>
  clips: Clip[]
  assets: AssetLookup
  assetBase: string
  fontBase: string
  fps?: number
  /** Export options can switch captions off or ducking on/off for one file; the project setting is the default. */
  captions?: boolean
  duckMusic?: boolean
}): ExplainerInput {
  const { project, assets } = args
  const fps = args.fps ?? EXPLAINER_FPS
  const look = resolveLook(project.templateId, project.theme)
  const voiceGain = (project.editor.voiceVolumeDb ?? 0) as number
  const allowed = getTemplate(project.templateId).sceneTypes
  let from = 0
  const scenes = args.clips.map((c): ExplainerSceneInput => {
    const frames = Math.max(1, Math.round((sceneDurationMs(c, assets) / 1000) * fps))
    const audioAsset = c.audioAssetId ? assets[c.audioAssetId] : undefined
    const imageAsset = c.imageAssetId ? assets[c.imageAssetId] : undefined
    const scene = c.scene ?? normalizeScene({ type: allowed[0], heading: c.title, body: c.narration }, allowed)
    let words: WordTiming[] = []
    let audio: ExplainerSceneInput['audio'] = null
    if (audioAsset?.durationMs) {
      const lead = SCENE_LEAD_MS / 1000
      // Explainer clips are never trimmed, but the shared rule keeps the words of a trimmed voice right.
      const shown = clipCaptionWords({ ...c, durationMs: audioAsset.durationMs }, audioAsset.meta.words ?? [], audioAsset.durationMs)
      words = shown.words.map((w) => ({ text: w.text, start: w.start + lead, end: w.end + lead }))
      audio = {
        src: fileUrl(args.assetBase, audioAsset.localPath),
        startFrame: Math.round(lead * fps),
        frames: Math.ceil((audioAsset.durationMs / 1000) * fps),
        volume: dbToGain(voiceGain + (c.voiceGainDb ?? 0))
      }
    }
    const out: ExplainerSceneInput = {
      id: c.id,
      scene,
      from,
      frames,
      audio,
      image: imageAsset ? { src: fileUrl(args.assetBase, imageAsset.localPath), width: imageAsset.width ?? 1600, height: imageAsset.height ?? 900 } : null,
      words
    }
    from += frames
    return out
  })
  const musicAsset = project.editor.musicAssetId ? assets[project.editor.musicAssetId] : undefined
  const logoAsset = project.theme?.logoAssetId ? assets[project.theme.logoAssetId] : undefined
  const { width, height } = explainerSize(project.aspectRatio)
  return {
    templateId: look.templateId,
    title: project.title,
    width,
    height,
    fps,
    totalFrames: Math.max(1, from),
    look,
    captions: args.captions ?? project.theme?.captions !== false,
    caption: resolveCaption(project.templateId, project.theme),
    fontBase: args.fontBase,
    logo: logoAsset ? fileUrl(args.assetBase, logoAsset.localPath) : null,
    scenes,
    music: musicAsset
      ? {
          src: fileUrl(args.assetBase, musicAsset.localPath),
          volume: dbToGain(project.editor.musicVolumeDb),
          duck: args.duckMusic ?? project.editor.duckMusic,
          trimBeforeFrames: Math.round(((project.editor.musicInMs ?? 0) / 1000) * fps)
        }
      : null
  }
}

/** Total length of an explainer video in ms. */
export function explainerTotalMs(clips: Clip[], assets: AssetLookup): number {
  return clips.reduce((n, c) => n + sceneDurationMs(c, assets), 0)
}

// ---------- samples (template previews, composition defaults) ----------

const sample = (s: Partial<ExplainerScene>): ExplainerScene => ({ ...emptyScene(s.type), ...s })

export const SAMPLE_SCENES: Record<ExplainerTemplateId, ExplainerScene[]> = {
  tutorial: [
    sample({ type: 'title', label: 'Git untuk pemula', heading: 'Simpan versi kodemu dengan Git', body: 'Lima menit, tanpa takut kehilangan kerjaan.' }),
    sample({
      type: 'step',
      value: '2',
      heading: 'Buat repositori baru',
      body: 'Masuk ke folder proyek, lalu jalankan perintah ini sekali saja.',
      codeKind: 'terminal',
      codeLanguage: 'bash',
      code: 'cd proyek-saya\ngit init\ngit add .\ngit commit -m "awal"'
    }),
    sample({ type: 'outro', heading: 'Sekarang setiap perubahan aman', body: 'Coba commit kecil setiap selesai satu fitur.' })
  ],
  tips: [
    sample({ type: 'title', label: 'Produktif', heading: '5 trik fokus kerja dari rumah', body: 'Nomor 3 paling sering dilupakan.' }),
    sample({ type: 'tip', value: '3', icon: '⏱️', heading: 'Pakai timer 25 menit', body: 'Kerja fokus 25 menit, istirahat 5 menit. Otak tetap segar sampai sore.' }),
    sample({ type: 'outro', heading: 'Mana yang mau kamu coba dulu?', body: 'Tulis di kolom komentar.' })
  ],
  facts: [
    sample({ type: 'title', label: 'Luar angkasa', heading: '5 fakta matahari yang bikin merinding', body: 'Fakta nomor 1 tidak masuk akal.' }),
    sample({ type: 'fact', label: '#1', value: '8 menit', heading: 'Cahaya matahari yang kamu lihat sudah tua', body: 'Cahayanya butuh sekitar 8 menit 20 detik untuk sampai ke Bumi.', author: 'NASA' }),
    sample({ type: 'outro', heading: 'Fakta mana yang paling mengejutkan?', body: 'Ikuti untuk fakta berikutnya.' })
  ],
  quote: [
    sample({ type: 'title', label: 'Motivasi pagi', heading: 'Mulai dari yang kecil', body: 'Tiga kutipan untuk memulai hari.' }),
    sample({ type: 'quote', heading: 'Perjalanan seribu mil dimulai dengan satu langkah.', author: 'Lao Tzu', body: 'Langkah pertama tidak perlu besar.' }),
    sample({ type: 'outro', heading: 'Satu langkah hari ini sudah cukup', body: 'Sampai jumpa besok.' })
  ],
  compare: [
    sample({ type: 'title', label: 'Mudik', heading: 'Mana yang lebih hemat buat mudik?', body: 'Kita adu dalam empat ronde.', leftTitle: 'Kereta', rightTitle: 'Pesawat' }),
    sample({
      type: 'versus',
      label: 'Harga',
      heading: 'Berapa ongkos sekali jalan?',
      leftTitle: 'Kereta',
      rightTitle: 'Pesawat',
      leftValue: 'Rp350 rb',
      rightValue: 'Rp1,2 jt',
      left: ['Harga tetap', 'Bisa pesan H-45'],
      right: ['Naik saat musim mudik', 'Belum termasuk bagasi'],
      side: 'left'
    }),
    sample({
      type: 'verdict',
      label: 'Pemenang',
      heading: 'Kereta menang untuk mudik hemat',
      body: 'Lebih murah dan tetap nyaman, asal kamu tidak sedang buru-buru.',
      leftTitle: 'Kereta',
      rightTitle: 'Pesawat',
      left: ['Budget terbatas', 'Jarak di bawah 800 km'],
      right: ['Cuti cuma dua hari'],
      side: 'left'
    })
  ],
  news: [
    sample({ type: 'title', label: 'Tekno', heading: 'Rangkuman kabar teknologi pekan ini', body: 'Tiga kabar yang perlu kamu tahu dalam satu menit.', value: '29 Okt 2026' }),
    sample({
      type: 'headline',
      label: 'Gawai',
      heading: 'Ponsel lipat makin tipis dan murah',
      body: 'Tiga produsen merilis ponsel lipat di bawah tujuh juta rupiah dengan engsel yang lebih awet.',
      author: 'Rilis resmi',
      value: '28 Okt 2026'
    }),
    sample({ type: 'points', heading: 'Poin penting', left: ['Ponsel lipat makin terjangkau', 'Fitur AI berjalan tanpa internet', 'Baterai tahan dua hari jadi standar'] })
  ]
}

/** Props for a template preview: sample scenes laid out like a real video, without audio or images. */
export function sampleExplainerInput(templateId: ExplainerTemplateId, aspect: AspectRatio, fontBase: string, theme?: ExplainerTheme): ExplainerInput {
  const fps = EXPLAINER_FPS
  const { width, height } = explainerSize(aspect)
  let from = 0
  const scenes = SAMPLE_SCENES[templateId].map((scene, i): ExplainerSceneInput => {
    const frames = 4 * fps
    const words = scene.heading.split(/\s+/).map((text, k) => ({ text, start: 0.5 + k * 0.32, end: 0.5 + k * 0.32 + 0.3 }))
    const out = { id: `sample-${i}`, scene, from, frames, audio: null, image: null, words }
    from += frames
    return out
  })
  return {
    templateId,
    title: SAMPLE_SCENES[templateId][0].heading,
    width,
    height,
    fps,
    totalFrames: from,
    look: resolveLook(templateId, theme),
    captions: false,
    caption: resolveCaption(templateId, theme),
    fontBase,
    logo: null,
    scenes,
    music: null
  }
}
