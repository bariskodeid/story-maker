import { app } from 'electron'
import { nineRouterFrame } from '@shared/imageModels'
import { endpointUrl } from '@shared/models'
import type { AspectRatio, ModelList, ModelOption } from '@shared/types'
import { getSecret } from '../secrets'
import { getSettings, readCache, writeCache } from '../settings'
import { ApiError, downloadTo, readError } from './http'
import { imageType } from './images'

/**
 * Image generation through the user's 9Router gateway (OpenAI-compatible `POST /images/generations`).
 * 9Router answers only when the picture is done, so there is no request id to poll or resume after a restart.
 */

const STALE_MS = 24 * 60 * 60 * 1000
// Codex/GPT Image runs as a tool call inside a chat turn and can take a few minutes on a busy account.
const GENERATE_TIMEOUT_MS = 6 * 60 * 1000
const LIST_TIMEOUT_MS = 20_000
const CONTENT_POLICY = /content[ _-]?policy|safety|moderation|nsfw|prohibited|violat|inappropriate|not allowed to generate/i

/** The model answered without a picture; for Gemini-style models this is often a fluke worth retrying. */
export class NoImageError extends ApiError {}

function connection(): { base: string; key: string | null } {
  const base = endpointUrl(getSettings(), 'ninerouter').trim().replace(/\/+$/, '')
  if (!base) throw new ApiError('9Router belum terhubung. Buka Pengaturan › Gambar dan video, lalu simpan alamat 9Router.', 0)
  return { base, key: getSecret('ninerouter') }
}

/** Upstream errors arrive as "[status]: message"; the status is already in the HTTP response. */
function cleanDetail(detail: string): string {
  return detail.replace(/^\[[^\]]*\]:\s*/, '').trim().slice(0, 300)
}

function friendly(status: number, rawDetail: string, contentType: string, model?: string): ApiError {
  const detail = cleanDetail(rawDetail)
  const m = model ? `"${model}"` : 'ini'
  // A Cloudflare (or similar) challenge page instead of JSON: the gateway never saw the request.
  if (/text\/html/i.test(contentType) && (status === 403 || status === 503))
    return new ApiError('Permintaan ke 9Router diblokir proteksi server (misalnya Cloudflare). Izinkan aplikasi ini di proteksi server 9Router-mu, atau pakai alamat lokalnya.', status)
  if (status === 401) return new ApiError('9Router meminta API key yang valid. Isi atau perbarui kunci 9Router di Pengaturan.', status)
  if (CONTENT_POLICY.test(detail))
    return new ApiError('Penyedia gambar menolak prompt ini karena filter konten. Ubah rencana visual adegan ini lalu coba lagi.', status)
  if (status === 404 || /invalid model format|model_not_found|does not exist|unknown model/i.test(detail))
    return new ApiError(`Model gambar ${m} tidak dikenal 9Router. Cek ID-nya di dashboard 9Router (contoh: cx/gpt-image-2.5), lalu pilih ulang di langkah Ide cerita.`, status)
  if (/no credentials for provider/i.test(detail))
    return new ApiError(`Belum ada akun yang terhubung di 9Router untuk model ${m}. Hubungkan penyedianya di dashboard 9Router.`, status)
  if (/does not support image generation/i.test(detail))
    return new ApiError(`Model ${m} tidak bisa membuat gambar. Pilih model dari daftar model gambar 9Router.`, status)
  if (status === 413) return new ApiError('Permintaan gambar terlalu besar untuk 9Router. Kurangi pemeran di adegan ini lalu coba lagi.', status)
  if (status === 429 || status === 503)
    return new ApiError(`Akun di 9Router sedang kena batas pemakaian. Tunggu sebentar lalu coba lagi. (${detail})`, status, true)
  if (status === 403) return new ApiError(`Akun di 9Router tidak boleh membuat gambar dengan model ${m}: ${detail}`, status)
  if (status >= 500) return new ApiError(`Penyedia di balik 9Router gagal membuat gambar (${status}): ${detail}`, status, true)
  return new ApiError(`9Router menolak permintaan gambar (${status}): ${detail}`, status)
}

async function request(path: string, init: RequestInit, timeoutMs: number, signal?: AbortSignal, model?: string): Promise<Response> {
  const { base, key } = connection()
  const timeout = AbortSignal.timeout(timeoutMs)
  let res: Response
  try {
    res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        // Node's default "node" agent is challenged by Cloudflare in front of hosted 9Router instances.
        'User-Agent': `Story Maker/${app.getVersion()}`,
        ...(key ? { Authorization: `Bearer ${key}` } : {})
      },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout
    })
  } catch (e) {
    if (signal?.aborted) throw e
    if (timeout.aborted) throw new ApiError('9Router terlalu lama membuat gambar. Coba lagi, atau pilih model yang lebih cepat.', 408, true)
    throw new ApiError(`Tidak bisa terhubung ke 9Router di ${base}. Pastikan 9Router sedang berjalan (npx 9router).`, 0)
  }
  if (!res.ok) {
    const contentType = res.headers.get('content-type') ?? ''
    throw friendly(res.status, await readError(res), contentType, model)
  }
  return res
}

export interface NineRouterImage {
  bytes: Buffer
  ext: string
  /** Set when the provider returned a link instead of the image itself. */
  url: string | null
}

export async function generateImage(model: string, prompt: string, aspect: AspectRatio, refs: string[], signal?: AbortSignal): Promise<NineRouterImage> {
  // No response_format: GPT Image rejects it and always answers b64_json; others may answer a URL instead.
  const body = { model, prompt, n: 1, ...nineRouterFrame(aspect), ...(refs.length ? { images: refs } : {}) }
  const res = await request('/images/generations', { method: 'POST', body: JSON.stringify(body) }, GENERATE_TIMEOUT_MS, signal, model)
  let bytes: Buffer | null = null
  let url: string | null = null
  if ((res.headers.get('content-type') ?? '').startsWith('image/')) {
    bytes = Buffer.from(await res.arrayBuffer())
  } else {
    const json = (await res.json().catch(() => ({}))) as { data?: { b64_json?: string; url?: string }[] }
    const first = json.data?.find((d) => d?.b64_json || d?.url)
    const inline = first?.b64_json || (first?.url?.startsWith('data:') ? first.url.slice(first.url.indexOf(',') + 1) : '')
    if (inline) bytes = Buffer.from(inline, 'base64')
    else if (first?.url) {
      url = first.url
      bytes = (await downloadTo(first.url, signal)).bytes
    }
  }
  const type = bytes && imageType(bytes)
  // Gemini-style models answer with text only (and an empty image) when they refuse or misread the prompt.
  if (!bytes || !type)
    throw new NoImageError('9Router selesai tanpa gambar. Modelnya mungkin menolak prompt ini atau bukan model gambar. Coba lagi, ubah prompt adegannya, atau pilih model lain.', 0)
  return { bytes, ext: type.ext, url }
}

/**
 * Image models of the providers connected in 9Router (`GET /models/image`; `/models` lists chat models only).
 * The cache key starts with `models:ninerouter`, so saving or removing the 9Router connection clears it too.
 */
export async function listImageModels(refresh = false): Promise<ModelList> {
  const { base } = connection()
  const key = `models:ninerouter-image:${base}`
  const cached = readCache<ModelOption[]>(key)
  if (cached && !refresh && Date.now() - cached.updatedAt < STALE_MS) return { models: cached.value, fetchedAt: cached.updatedAt }
  let data: { id?: string; owned_by?: string }[] = []
  try {
    const res = await request('/models/image', { method: 'GET' }, LIST_TIMEOUT_MS)
    data = ((await res.json()) as { data?: typeof data }).data ?? []
  } catch (e) {
    // Older 9Router builds have no image list; the picker still takes a typed model id.
    if (e instanceof ApiError && e.status === 404) return { models: [], fetchedAt: Date.now() }
    throw e
  }
  const models: ModelOption[] = data
    .filter((m): m is { id: string; owned_by?: string } => !!m?.id)
    .map((m) => ({
      id: m.id,
      name: m.id,
      description: m.owned_by === 'combo' ? 'Combo 9Router (fallback antar model)' : m.owned_by ? `Lewat penyedia ${m.owned_by} di 9Router` : undefined,
      tags: m.owned_by === 'combo' ? ['Combo'] : []
    }))
    .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))
  return { models, fetchedAt: writeCache(key, models) }
}
