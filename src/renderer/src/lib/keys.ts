import { isNineRouterImage } from '@shared/imageModels'
import { llmName } from '@shared/models'
import type { ApiProvider, AppSettings, KeyStatus, TtsProvider } from '@shared/types'

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

/** A key counts once it is saved and did not fail its last check. */
function keyOk(keys: KeyStatus[], p: ApiProvider): boolean {
  const k = keys.find((x) => x.provider === p)
  return !!k?.configured && k.lastOk !== false
}

/**
 * What one-click generate would call but cannot yet, as phrases like "kunci Higgsfield"; empty when it can run.
 * Only the parts still to be made are checked, so a project with a finished script needs no LLM key.
 */
export function missingServices(
  settings: AppSettings,
  keys: KeyStatus[],
  need: { story: boolean; imageModel: string | null; tts: TtsProvider | null }
): string[] {
  const out: string[] = []
  // 9Router is one connection (address + optional key) for story, images and voice, so it is named once.
  const NINEROUTER = 'koneksi 9Router'
  const llm = settings.llmProvider
  if (need.story && !keyOk(keys, llm)) out.push(llm === 'ninerouter' ? NINEROUTER : `kunci ${llmName(llm)}`)
  else if (need.story && !settings.llmModels[llm]) out.push(`model ${llmName(llm)}`)
  if (need.imageModel !== null) {
    if (isNineRouterImage(need.imageModel)) {
      if (!keyOk(keys, 'ninerouter')) out.push(NINEROUTER)
    } else if (!keyOk(keys, 'higgsfield')) out.push('kunci Higgsfield')
  }
  if (need.tts && !ttsReadiness(keys)[need.tts].ok) out.push(need.tts === 'ninerouter' ? NINEROUTER : `suara narator ${TTS_NAMES[need.tts]}`)
  return [...new Set(out)]
}
