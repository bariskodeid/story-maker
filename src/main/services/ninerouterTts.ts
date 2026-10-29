import { app } from 'electron'
import { LANGUAGES, endpointUrl } from '@shared/models'
import type { VoiceOption } from '@shared/types'
import { NINEROUTER_VOICES, edgeVoiceName, type NineRouterVoice } from '@shared/voices'
import { getSecret } from '../secrets'
import { getSettings, readCache, writeCache } from '../settings'
import { isWav, pcmToWav } from './audio'
import { readError } from './http'

/**
 * Narration through 9Router's OpenAI-style POST /v1/audio/speech. The `model` field is the voice
 * (`edge-tts/id-ID-ArdiNeural`, `openai/tts-1`, a combo name...), and the reply is raw audio bytes (MP3 for
 * most voices, WAV for Gemini) without word timings. Uses the same base URL and optional key as the 9Router
 * story writer.
 */

const SPEECH_TIMEOUT_MS = 180_000
// The live voice list is optional (many installs answer 401 or 502), so a slow server must not hold up the picker.
const LIST_TIMEOUT_MS = 8_000
const LIVE_TTL_MS = 24 * 60 * 60 * 1000
const FALLBACK_TTL_MS = 60 * 60 * 1000

interface Conn {
  base: string
  key: string | null
}

function conn(): Conn {
  const base = endpointUrl(getSettings(), 'ninerouter').trim().replace(/\/+$/, '')
  if (!base) throw new Error('Alamat 9Router belum diisi. Buka Pengaturan, bagian Suara narator, untuk menghubungkannya.')
  return { base, key: getSecret('ninerouter') }
}

function headers(c: Conn, extra: Record<string, string> = {}): Record<string, string> {
  return {
    // Cloudflare in front of hosted 9Router installs challenges fetch's default "node" user agent.
    'User-Agent': `Story Maker/${app.getVersion()}`,
    ...(c.key ? { Authorization: `Bearer ${c.key}` } : {}),
    ...extra
  }
}

function friendly(status: number, detail: string, html: boolean): string {
  if (status === 403 && html)
    return 'Permintaan ke 9Router diblokir proteksi server (misalnya Cloudflare). Izinkan aplikasi ini di pengaturan proteksi server 9Router.'
  if (status === 401) return '9Router meminta API key yang valid. Isi kunci 9Router di Pengaturan.'
  if (status === 404) return 'Endpoint suara tidak ditemukan di 9Router ini. Perbarui 9Router ke versi terbaru, lalu periksa alamatnya (diakhiri /v1).'
  if (/No credentials for provider/i.test(detail)) return `Penyedia suara ini belum dihubungkan di dashboard 9Router: ${detail}`
  if (status === 429 || status === 503) return `Penyedia suara di 9Router sedang dibatasi atau sibuk. Coba lagi sebentar.${detail ? ` (${detail})` : ''}`
  if (status === 400) return `9Router menolak permintaan suara: ${detail}`
  if (status >= 500) return `Penyedia suara di 9Router gagal (${status}): ${detail || 'tanpa keterangan'}`
  return `9Router gagal (${status}): ${detail}`
}

async function request(c: Conn, path: string, init: RequestInit, timeoutMs: number, signal?: AbortSignal): Promise<Response> {
  const timeout = AbortSignal.timeout(timeoutMs)
  let res: Response
  try {
    res = await fetch(`${c.base}${path}`, { ...init, signal: signal ? AbortSignal.any([signal, timeout]) : timeout })
  } catch (e) {
    if (signal?.aborted) throw new Error('Dibatalkan')
    if ((e as Error).name === 'TimeoutError') throw new Error('9Router terlalu lama merespons. Coba lagi sebentar.')
    throw new Error(`Tidak bisa terhubung ke 9Router di ${c.base}. Pastikan 9Router sedang berjalan (npx 9router): ${(e as Error).message}`)
  }
  if (res.ok) return res
  // An HTML error page (a proxy challenge, a dashboard page) says nothing useful when quoted.
  const html = /text\/html/i.test(res.headers.get('content-type') ?? '')
  const detail = html ? '' : await readError(res)
  throw new Error(friendly(res.status, detail, html))
}

/** 9Router places Edge TTS input into SSML without escaping it, so a bare "&" or "<" would break the request. */
function inputFor(text: string, voice: string): string {
  if (!voice.startsWith('edge-tts/')) return text
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Audio bytes with the file extension FFmpeg should see; raw PCM gets a WAV header. */
function audioFile(bytes: Buffer, contentType: string, format?: string): { audio: Buffer; ext: string } {
  if (bytes.length < 100) throw new Error('9Router mengirim audio kosong. Coba suara lain.')
  if (isWav(bytes)) return { audio: bytes, ext: '.wav' }
  // 9Router's Gemini voices answer 24 kHz mono PCM when they skip the WAV wrapper.
  if (/pcm/i.test(contentType) || format === 'pcm') return { audio: pcmToWav(bytes), ext: '.wav' }
  if (bytes.subarray(0, 4).toString('ascii') === 'OggS') return { audio: bytes, ext: '.ogg' }
  return { audio: bytes, ext: '.mp3' }
}

/** Speaks text with a 9Router voice and returns the audio file (MP3, WAV or OGG). */
export async function speak(text: string, voice: string, languageCode: string, signal?: AbortSignal): Promise<{ audio: Buffer; ext: string }> {
  if (!voice.trim()) throw new Error('Pilih suara 9Router dulu di langkah Ide cerita.')
  const c = conn()
  // Gemini voices in 9Router read the language as "Say in <language>: ...", so it is sent as an English name.
  const language = LANGUAGES.find((l) => l.code === languageCode)?.english
  const res = await request(
    c,
    '/audio/speech',
    {
      method: 'POST',
      headers: headers(c, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ model: voice.trim(), input: inputFor(text, voice), ...(language ? { language } : {}) })
    },
    SPEECH_TIMEOUT_MS,
    signal
  )
  const type = res.headers.get('content-type') ?? ''
  const bytes = Buffer.from(await res.arrayBuffer())
  if (/text\/html/i.test(type)) throw new Error('Alamat 9Router sepertinya salah: yang menjawab halaman web, bukan API. Pastikan alamatnya diakhiri /v1.')
  if (/json/i.test(type)) {
    // The response_format=json shape: { audio: base64, format }.
    const body = JSON.parse(bytes.toString('utf8')) as { audio?: string; format?: string; error?: { message?: string } | string }
    if (!body.audio) throw new Error(`9Router tidak mengirim audio: ${typeof body.error === 'string' ? body.error : (body.error?.message ?? 'balasan tanpa audio')}`)
    return audioFile(Buffer.from(body.audio, 'base64'), '', body.format)
  }
  return audioFile(bytes, type)
}

// ---------- voices ----------

function languageLabel(code: string): string {
  const known = LANGUAGES.find((l) => l.code === code)?.label
  if (known) return known
  try {
    return new Intl.DisplayNames(['id'], { type: 'language' }).of(code) ?? code
  } catch {
    return code
  }
}

function toOption(v: Pick<NineRouterVoice, 'id' | 'name' | 'locale'> & { gender?: string }): VoiceOption {
  const [lang, region] = v.locale.split('-')
  const code = (lang ?? '').toLowerCase()
  const label = languageLabel(code)
  const gender = /^m/i.test(v.gender ?? '') ? 'Pria' : /^f/i.test(v.gender ?? '') ? 'Wanita' : ''
  return {
    id: v.id,
    name: v.name,
    description: [region && code !== 'id' ? `${label} (${region})` : label, gender].filter(Boolean).join(' · '),
    language: code,
    tags: [label, gender].filter(Boolean)
  }
}

async function liveEdgeVoices(c: Conn): Promise<VoiceOption[]> {
  const res = await request(c, '/audio/voices?provider=edge-tts', { headers: headers(c, { Accept: 'application/json' }) }, LIST_TIMEOUT_MS)
  const body = (await res.json()) as { data?: { id?: string; gender?: string; model?: string }[] }
  const out = (body.data ?? [])
    .filter((v): v is { id: string; gender?: string; model?: string } => typeof v.id === 'string' && /^[a-z]{2,3}-[A-Za-z]{2,4}-/.test(v.id))
    .map((v) => toOption({ id: v.model || `edge-tts/${v.id}`, name: edgeVoiceName(v.id), locale: v.id.split('-').slice(0, 2).join('-'), gender: v.gender }))
  if (!out.length) throw new Error('daftar suara Edge kosong')
  return out
}

/** Other TTS models and combos the user connected in 9Router (OpenAI, Gemini, Google TTS...). */
async function otherVoices(c: Conn): Promise<VoiceOption[]> {
  const res = await request(c, '/models/tts', { headers: headers(c, { Accept: 'application/json' }) }, LIST_TIMEOUT_MS)
  const body = (await res.json()) as { data?: { id?: string; owned_by?: string }[] }
  return (
    (body.data ?? [])
      .filter((m): m is { id: string; owned_by?: string } => typeof m.id === 'string' && !!m.id)
      // Edge voices are listed above; ElevenLabs entries are models that still need a voice id (el/<voice_id>).
      .filter((m) => !/^(edge-tts|el|elevenlabs)\//.test(m.id))
      .map((m) => ({
        id: m.id,
        name: m.id,
        description: m.owned_by === 'combo' ? 'Combo TTS di 9Router' : `Model suara 9Router${m.owned_by ? ` · ${m.owned_by}` : ''}`,
        tags: [m.owned_by === 'combo' ? 'Combo' : 'Lainnya']
      }))
  )
}

/**
 * Voices to pick from: Edge TTS voices listed live by 9Router (or the bundled list when it cannot list them),
 * plus other TTS models connected there. Any other `provider/voice` id can still be typed in the picker.
 */
export async function listVoices(refresh = false): Promise<VoiceOption[]> {
  const curated = (): VoiceOption[] => NINEROUTER_VOICES.map(toOption)
  let c: Conn
  try {
    c = conn()
  } catch {
    return curated()
  }
  const key = `voices:ninerouter:${c.base}`
  const cached = readCache<{ voices: VoiceOption[]; live: boolean }>(key)
  if (!refresh && cached?.value.voices?.length && Date.now() - cached.updatedAt < (cached.value.live ? LIVE_TTL_MS : FALLBACK_TTL_MS))
    return cached.value.voices
  const warn = (what: string) => (e: unknown) => {
    console.warn(`[9router] ${what}:`, (e as Error).message)
    return null
  }
  const [edge, others] = await Promise.all([liveEdgeVoices(c).catch(warn('voice list')), otherVoices(c).catch(warn('tts models'))])
  const voices = [...(edge ?? curated()), ...(others ?? [])]
  writeCache(key, { voices, live: !!edge })
  return voices
}
