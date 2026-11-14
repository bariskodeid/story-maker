import type { ExplainerTemplateId } from './explainer'

/** Prompt fields that offer the Magic button. */
export type MagicField =
  | 'storyIdea'
  | 'explainerTopic'
  | 'seriesPremise'
  | 'explainerSeriesTopic'
  | 'episodeSynopsis'
  | 'characterLook'
  | 'visualPrompt'
  | 'videoPrompt'
  | 'sceneImagePrompt'

/** "improve" enriches what the user wrote; "generate" invents a fresh idea (the text, if any, is a loose theme). */
export type MagicMode = 'improve' | 'generate'

export interface MagicRequest {
  field: MagicField
  mode: MagicMode
  text: string
  // Ids let main read context from the database; the loose fields cover Home, where nothing is saved yet.
  projectId?: string
  clipId?: string
  seriesId?: string
  characterName?: string
  language?: string
  durationSec?: number
  templateId?: ExplainerTemplateId
  styleId?: string
  episodeCount?: number
}

export interface MagicResult {
  text: string
}

/** Ceilings per field, so a result always fits back into the field it came from. */
export const MAGIC_LIMITS: Record<MagicField, number> = {
  storyIdea: 4000,
  explainerTopic: 4000,
  seriesPremise: 4000,
  explainerSeriesTopic: 4000,
  episodeSynopsis: 1200,
  characterLook: 600,
  visualPrompt: 1500,
  videoPrompt: 400,
  sceneImagePrompt: 600
}

/** Improving needs something to improve; an empty field can only be generated. */
export function magicModes(text: string): MagicMode[] {
  return text.trim() ? ['improve', 'generate'] : ['generate']
}

const QUOTE_PAIRS = [
  ['"', '"'],
  ["'", "'"],
  ['“', '”'],
  ['‘', '’']
]

/** Models like to wrap an answer in quotes or a code fence even when told not to. */
export function cleanMagicText(raw: string, field: MagicField): string {
  let t = raw.trim()
  const fence = t.match(/^```[a-z]*\s*\n([\s\S]*?)\n?```$/i) ?? t.match(/^```[a-z]*[ \t]+([^\n]*?)[ \t]*```$/i)
  if (fence) t = fence[1].trim()
  // Only a matching pair, and only when that quote never occurs inside: otherwise it is dialogue, not a wrapper.
  const pair = QUOTE_PAIRS.find(([open, close]) => t.length > 1 && t.startsWith(open) && t.endsWith(close))
  if (pair) {
    const inner = t.slice(1, -1)
    if (!inner.includes(pair[0]) && !inner.includes(pair[1])) t = inner.trim()
  }
  return t.slice(0, MAGIC_LIMITS[field]).trim()
}
