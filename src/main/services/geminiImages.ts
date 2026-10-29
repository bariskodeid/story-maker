import { ApiError as GenAiError, type Part } from '@google/genai'
import type { AspectRatio, ModelList, ModelOption } from '@shared/types'
import { readCache, writeCache } from '../settings'
import { client, friendly as friendlyGemini } from './gemini'
import { ApiError } from './http'
import { imageType } from './images'

/**
 * Clip images and character sheets from Gemini image models ("Nano Banana") with the user's own Google AI Studio
 * key. `generateContent` answers only when the picture is done, so like 9Router there is no request id to resume
 * after a restart.
 */

const STALE_MS = 24 * 60 * 60 * 1000
const GENERATE_TIMEOUT_MS = 5 * 60 * 1000
const BLOCKED = /SAFETY|PROHIBITED|BLOCKLIST|SPII|MODEL_ARMOR/

/** The model answered without a picture; Gemini image models do this now and then for the same prompt. */
export class NoImageError extends ApiError {}

function friendly(e: unknown, model: string): ApiError {
  const msg = ((e as Error)?.message ?? String(e)).replace(/\s+/g, ' ')
  const status = e instanceof GenAiError ? e.status : 0
  const short = msg.slice(0, 240)
  if (status === 401 || /API key not valid|API_KEY_INVALID|UNAUTHENTICATED/i.test(msg)) return new ApiError('Kunci Gemini ditolak. Periksa kunci di Pengaturan.', 401)
  // Image models have no free tier: a key without billing gets a quota of zero rather than a clear error.
  if ((status === 429 || /RESOURCE_EXHAUSTED/.test(msg)) && /limit:\s*0\b|free_tier/i.test(msg))
    return new ApiError('Model gambar Gemini butuh billing aktif. Aktifkan billing untuk project kunci ini di Google AI Studio, lalu coba lagi.', 429)
  if (status === 429 || /RESOURCE_EXHAUSTED/.test(msg))
    return new ApiError('Kuota gambar Gemini sedang habis atau terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.', 429, true)
  if (status === 403 || /PERMISSION_DENIED/.test(msg)) return new ApiError(`Kunci Gemini ini tidak boleh memakai model "${model}": ${short}`, 403)
  if (status === 404 || /NOT_FOUND/.test(msg))
    return new ApiError(`Model gambar "${model}" tidak tersedia untuk kunci Gemini ini. Pilih model lain di bagian Model AI.`, 404)
  if (status === 413) return new ApiError('Permintaan gambar terlalu besar untuk Gemini. Kurangi pemeran di adegan ini lalu coba lagi.', 413)
  if (status >= 500 || /UNAVAILABLE|INTERNAL|overloaded/i.test(msg))
    return new ApiError(`Server Gemini sedang bermasalah${status ? ` (${status})` : ''}. Coba lagi sebentar lagi.`, status, true)
  if (status === 400) return new ApiError(`Gemini menolak permintaan gambar: ${short}`, 400)
  return new ApiError(`Tidak bisa membuat gambar lewat Gemini: ${short}`, status)
}

/** A `data:` URI from `inlineReference` as an inline image part. */
function referencePart(dataUri: string): Part {
  const comma = dataUri.indexOf(',')
  const mimeType = /^data:([^;,]+)/.exec(dataUri)?.[1] ?? 'image/jpeg'
  return { inlineData: { mimeType, data: dataUri.slice(comma + 1) } }
}

export interface GeminiImage {
  bytes: Buffer
  ext: string
}

export async function generateImage(model: string, prompt: string, aspect: AspectRatio, refs: string[], signal?: AbortSignal): Promise<GeminiImage> {
  let res
  try {
    res = await client().models.generateContent({
      model,
      // Reference sheets go before the prompt that names them, as in Google's multi-image examples.
      contents: [{ role: 'user', parts: [...refs.map(referencePart), { text: prompt }] }],
      config: {
        responseModalities: ['IMAGE'],
        imageConfig: { aspectRatio: aspect },
        abortSignal: signal,
        httpOptions: { timeout: GENERATE_TIMEOUT_MS }
      }
    })
  } catch (e) {
    if (signal?.aborted) throw e
    throw friendly(e, model)
  }
  const blocked = res.promptFeedback?.blockReason ?? res.candidates?.[0]?.finishReason ?? ''
  const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)
  const bytes = part?.inlineData?.data ? Buffer.from(part.inlineData.data, 'base64') : null
  const type = bytes && imageType(bytes)
  if (bytes && type) return { bytes, ext: type.ext }
  if (BLOCKED.test(String(blocked)))
    throw new ApiError('Gemini menolak membuat gambar ini karena filter keamanannya. Ubah rencana visual adegan ini lalu coba lagi.', 400)
  throw new NoImageError('Gemini selesai tanpa gambar. Coba lagi, ubah prompt adegannya, atau pilih model gambar lain.', 0)
}

/**
 * Gemini models that can draw (the "-image" ones answering `generateContent`); Imagen models use another endpoint.
 * The cache key starts with `models:gemini`, so saving or removing the Gemini key clears it too.
 */
export async function listImageModels(refresh = false): Promise<ModelList> {
  const key = 'models:gemini-image'
  const cached = readCache<ModelOption[]>(key)
  if (cached && !refresh && Date.now() - cached.updatedAt < STALE_MS) return { models: cached.value, fetchedAt: cached.updatedAt }
  const models: ModelOption[] = []
  try {
    const pager = await client().models.list({ config: { pageSize: 200 } })
    for await (const m of pager) {
      const id = (m.name ?? '').replace(/^models\//, '')
      if (!/^gemini.*image/i.test(id) || !(m.supportedActions ?? []).includes('generateContent')) continue
      models.push({ id, name: m.displayName || id, description: m.description?.slice(0, 280), tags: /preview/i.test(id) ? ['Preview'] : [] })
    }
  } catch (e) {
    throw friendlyGemini(e)
  }
  // Newest versions first (3.1 before 2.5).
  models.sort((a, b) => b.id.localeCompare(a.id, 'en', { numeric: true }))
  return { models, fetchedAt: writeCache(key, models) }
}
