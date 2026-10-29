import Anthropic from '@anthropic-ai/sdk'
import { app } from 'electron'
import type { KeyTestResult, ModelOption } from '@shared/types'
import { getSecret, requireSecret } from '../secrets'
import { extractJson } from './json'

// Development builds can point at a local mock (STUDIO_ANTHROPIC_BASE) to test without a key or spending money.
const BASE = (!app.isPackaged && process.env.STUDIO_ANTHROPIC_BASE) || 'https://api.anthropic.com'

// Long scripts (a 10-minute video) need a large answer; the request streams, so no HTTP timeout applies.
const MAX_TOKENS = 64_000

function client(key?: string): Anthropic {
  // Key and address are always passed in, so ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL or a CLI login on this computer
  // can never send the request elsewhere or bill another account.
  return new Anthropic({ apiKey: key ?? requireSecret('anthropic'), baseURL: BASE, maxRetries: 2 })
}

/** The API's own message from an error body, e.g. "Your credit balance is too low". */
function detail(e: InstanceType<typeof Anthropic.APIError>): string {
  const body = e.error as { error?: { message?: string } } | undefined
  return body?.error?.message ?? e.message
}

function friendly(e: unknown, model?: string): Error {
  // A cancelled job must stay recognisable as a cancel.
  if (e instanceof Anthropic.APIUserAbortError) return e
  const m = model ? `"${model}"` : 'ini'
  if (e instanceof Anthropic.AuthenticationError) return new Error('Kunci Anthropic ditolak. Periksa kunci di Pengaturan.')
  if (e instanceof Anthropic.PermissionDeniedError) return new Error(`Kunci Anthropic ini tidak boleh memakai model ${m}: ${detail(e)}`)
  if (e instanceof Anthropic.NotFoundError) return new Error(`Model Claude ${m} tidak ditemukan. Pilih model lain di Pengaturan.`)
  if (e instanceof Anthropic.RateLimitError) return new Error('Anthropic sedang membatasi permintaan (rate limit). Tunggu sebentar lalu coba lagi.')
  if (e instanceof Anthropic.BadRequestError) {
    const d = detail(e)
    if (/credit balance/i.test(d)) return new Error('Saldo kredit Anthropic habis. Isi ulang di Claude Console lalu coba lagi.')
    return new Error(`Anthropic menolak permintaan: ${d}`)
  }
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new Error('Anthropic terlalu lama merespons. Coba lagi atau pilih model yang lebih cepat.')
  if (e instanceof Anthropic.APIConnectionError) return new Error(`Tidak bisa terhubung ke Anthropic: ${e.message}`)
  if (e instanceof Anthropic.APIError)
    return new Error(e.status === 529 ? 'Server Anthropic sedang penuh. Coba lagi sebentar lagi.' : `Server Anthropic bermasalah (${e.status}). Coba lagi nanti.`)
  return e instanceof Error ? e : new Error(String(e))
}

export async function testKey(key?: string | null): Promise<KeyTestResult> {
  const k = key ?? getSecret('anthropic')
  if (!k) return { ok: false, message: 'Kunci belum diatur' }
  try {
    const page = await client(k).models.list({ limit: 100 })
    const usable = page.data.filter((m) => m.lifecycle !== 'retired').length
    return { ok: true, message: `Terhubung · ${usable} model Claude tersedia` }
  } catch (e) {
    return { ok: false, message: friendly(e).message }
  }
}

/** Live model list, newest first as the API sends it. Retired models can no longer answer, so they are left out. */
export async function listModels(): Promise<ModelOption[]> {
  const out: ModelOption[] = []
  try {
    for await (const m of client().models.list({ limit: 100 })) {
      if (m.lifecycle === 'retired') continue
      out.push({
        id: m.id,
        name: m.display_name || m.id,
        description: m.lifecycle === 'deprecated' ? 'Model ini akan dipensiunkan Anthropic. Sebaiknya pilih model yang lebih baru.' : undefined,
        contextLength: m.max_input_tokens ?? null,
        priceIn: null,
        priceOut: null,
        tags: m.lifecycle === 'deprecated' ? ['JSON', 'Usang'] : ['JSON']
      })
    }
  } catch (e) {
    throw friendly(e)
  }
  return out
}

/** Output caps per model, asked once: older models reject a `max_tokens` above their own limit. */
const outputCaps = new Map<string, number>()

async function maxTokensFor(ai: Anthropic, model: string): Promise<number> {
  const known = outputCaps.get(model)
  if (known) return known
  const cap = await ai.models
    .retrieve(model)
    .then((m) => Math.min(MAX_TOKENS, m.max_tokens ?? MAX_TOKENS))
    .catch(() => MAX_TOKENS)
  outputCaps.set(model, cap)
  return cap
}

async function ask(ai: Anthropic, model: string, system: string, prompt: string, schema: object | null, signal?: AbortSignal): Promise<unknown> {
  const stream = ai.beta.messages.stream(
    {
      model,
      max_tokens: await maxTokensFor(ai, model),
      system,
      messages: [{ role: 'user', content: prompt }],
      ...(schema ? { output_config: { format: { type: 'json_schema' as const, schema: schema as Record<string, unknown> } } } : {}),
      // When a model's safety classifier declines, the API reruns the request on a model suited to that category.
      // Models without fallback support ignore this and run alone.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default'
    },
    { signal }
  )
  const message = await stream.finalMessage()
  if (message.stop_reason === 'refusal')
    throw new Error('Claude menolak menulis bagian ini karena filter keamanannya. Ubah ide atau naskahnya, lalu coba lagi.')
  if (message.stop_reason === 'max_tokens')
    throw new Error(`Jawaban model "${model}" terpotong sebelum selesai. Coba durasi video lebih pendek atau model dengan output lebih panjang.`)
  const text = message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
  if (!text.trim()) throw new Error('Claude tidak mengirim jawaban. Coba lagi.')
  return schema ? JSON.parse(text) : extractJson(text)
}

/** Structured JSON output; a schema the API cannot enforce is written into the prompt instead. */
export async function generateJson(model: string, system: string, prompt: string, schema: object, signal?: AbortSignal): Promise<unknown> {
  const ai = client()
  try {
    return await ask(ai, model, system, prompt, schema, signal)
  } catch (e) {
    // Structured outputs support a subset of JSON Schema; only a rejected schema is worth a second, looser try.
    if (!(e instanceof Anthropic.BadRequestError) || !/schema|output_config|format/i.test(detail(e))) throw friendly(e, model)
  }
  try {
    const loose = `${system}\n\nReply with ONE JSON object only (no markdown, no commentary) that matches this JSON Schema:\n${JSON.stringify(schema)}`
    return await ask(ai, model, loose, prompt, null, signal)
  } catch (e) {
    throw friendly(e, model)
  }
}
