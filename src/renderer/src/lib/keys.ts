import type { KeyStatus, TtsProvider } from '@shared/types'

export const TTS_PROVIDERS: TtsProvider[] = ['gemini', 'elevenlabs', 'ninerouter']

export const TTS_NAMES: Record<TtsProvider, string> = { gemini: 'Gemini TTS', elevenlabs: 'ElevenLabs', ninerouter: '9Router' }

/**
 * Whether each narrator voice service can be used: it needs a saved key (9Router: a saved address) that did
 * not fail its last check. `reason` says why not, for disabled options.
 */
export function ttsReadiness(keys: KeyStatus[]): Record<TtsProvider, { ok: boolean; reason: string | null }> {
  const one = (p: TtsProvider): { ok: boolean; reason: string | null } => {
    const k = keys.find((x) => x.provider === p)
    if (p === 'ninerouter') {
      if (!k?.configured) return { ok: false, reason: '9Router belum dihubungkan' }
      if (k.lastOk === false) return { ok: false, reason: '9Router tidak bisa dihubungi' }
      return { ok: true, reason: null }
    }
    const name = p === 'gemini' ? 'Gemini' : 'ElevenLabs'
    if (!k?.configured) return { ok: false, reason: `Kunci ${name} belum diisi` }
    if (k.lastOk === false) return { ok: false, reason: `Kunci ${name} tidak valid` }
    return { ok: true, reason: null }
  }
  return { gemini: one('gemini'), elevenlabs: one('elevenlabs'), ninerouter: one('ninerouter') }
}

/** The preferred provider when it is usable, otherwise another usable one, otherwise the preferred one anyway. */
export function usableTts(preferred: TtsProvider, keys: KeyStatus[]): TtsProvider {
  const ready = ttsReadiness(keys)
  if (ready[preferred].ok) return preferred
  return TTS_PROVIDERS.find((p) => ready[p].ok) ?? preferred
}
