import type { TtsProvider } from './types'

/**
 * Voices for narration through 9Router. Its /v1/audio/speech takes the voice as the `model` field, written
 * `<provider>/<voice>` (e.g. `edge-tts/id-ID-ArdiNeural`, `openai/tts-1`), so a voice id is a 9Router model id.
 */

export interface NineRouterVoice {
  id: string
  name: string
  /** BCP 47 locale, e.g. id-ID. */
  locale: string
  gender: 'male' | 'female'
}

const edge = (shortName: string, gender: NineRouterVoice['gender']): NineRouterVoice => ({
  id: `edge-tts/${shortName}`,
  name: edgeVoiceName(shortName),
  locale: shortName.split('-').slice(0, 2).join('-'),
  gender
})

/**
 * Edge TTS voices that need no account in 9Router, for the app's narration languages. Used when 9Router
 * cannot list voices itself (its voice list sits behind dashboard login on many installs). The first voice
 * of each language is that language's default.
 */
export const NINEROUTER_VOICES: NineRouterVoice[] = [
  edge('id-ID-ArdiNeural', 'male'),
  edge('id-ID-GadisNeural', 'female'),
  edge('en-US-AndrewNeural', 'male'),
  edge('en-US-AvaNeural', 'female'),
  edge('en-US-BrianNeural', 'male'),
  edge('en-US-EmmaNeural', 'female'),
  edge('en-US-ChristopherNeural', 'male'),
  edge('en-US-AriaNeural', 'female'),
  edge('en-US-GuyNeural', 'male'),
  edge('en-US-JennyNeural', 'female'),
  edge('en-US-EricNeural', 'male'),
  edge('en-US-MichelleNeural', 'female'),
  edge('en-GB-RyanNeural', 'male'),
  edge('en-GB-SoniaNeural', 'female'),
  edge('en-GB-ThomasNeural', 'male'),
  edge('en-GB-LibbyNeural', 'female'),
  edge('en-AU-WilliamNeural', 'male'),
  edge('en-AU-NatashaNeural', 'female'),
  edge('ms-MY-OsmanNeural', 'male'),
  edge('ms-MY-YasminNeural', 'female'),
  edge('jv-ID-DimasNeural', 'male'),
  edge('jv-ID-SitiNeural', 'female'),
  edge('su-ID-JajangNeural', 'male'),
  edge('su-ID-TutiNeural', 'female'),
  edge('es-ES-AlvaroNeural', 'male'),
  edge('es-ES-ElviraNeural', 'female'),
  edge('es-MX-JorgeNeural', 'male'),
  edge('es-MX-DaliaNeural', 'female'),
  edge('ar-SA-HamedNeural', 'male'),
  edge('ar-SA-ZariyahNeural', 'female')
]

/** "id-ID-ArdiNeural" → "Ardi", "en-US-AndrewMultilingualNeural" → "Andrew Multilingual". */
export function edgeVoiceName(shortName: string): string {
  const base = shortName.split('-').slice(2).join('-').replace(/Neural$/, '')
  return base.replace(/([a-z])([A-Z])/g, '$1 $2') || shortName
}

/** A readable name for a 9Router voice id. */
export function nineRouterVoiceName(id: string): string {
  const known = NINEROUTER_VOICES.find((v) => v.id === id)
  if (known) return known.name
  const m = /^edge-tts\/(.+)$/.exec(id)
  return m ? edgeVoiceName(m[1]) : id
}

/** The voice a project starts with for a provider and narration language. */
export function defaultTtsVoice(provider: TtsProvider, language: string): string {
  if (provider === 'gemini') return 'Charon'
  if (provider === 'ninerouter') {
    const v = NINEROUTER_VOICES.find((x) => x.locale.startsWith(`${language}-`)) ?? NINEROUTER_VOICES.find((x) => x.locale === 'en-US')
    return v!.id
  }
  // ElevenLabs voices belong to the user's account, so there is no fixed default.
  return ''
}
