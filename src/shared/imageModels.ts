import { getImageModel, maxRefs } from './higgsfield'
import type { AspectRatio } from './types'

/**
 * Clip images and character sheets come from Higgsfield's catalog, from an image model the user connected in
 * 9Router, or from the Gemini API with the user's own Google AI Studio key. A project keeps a 9Router choice as
 * `9router:<model id>` and a Gemini one as `gemini:<model id>` in the same `imageModel` field, so no migration is
 * needed and every Higgsfield id keeps its meaning. Video always stays on Higgsfield.
 */
export const NINEROUTER_IMAGE_PREFIX = '9router:'
export const GEMINI_IMAGE_PREFIX = 'gemini:'

/** Nano Banana 2, the Gemini image model new projects start with when Gemini is picked. */
export const DEFAULT_GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image'

export type ImageSource = 'higgsfield' | 'ninerouter' | 'gemini'

const hasPrefix = (id: string | null | undefined, prefix: string): id is string => !!id && id.startsWith(prefix) && id.length > prefix.length

export function isNineRouterImage(id: string | null | undefined): id is string {
  return hasPrefix(id, NINEROUTER_IMAGE_PREFIX)
}

export function isGeminiImage(id: string | null | undefined): id is string {
  return hasPrefix(id, GEMINI_IMAGE_PREFIX)
}

/** Which service draws pictures for this `imageModel` value. */
export function imageSource(id: string | null | undefined): ImageSource {
  if (isNineRouterImage(id)) return 'ninerouter'
  if (isGeminiImage(id)) return 'gemini'
  return 'higgsfield'
}

/** The id 9Router routes on, e.g. `cx/gpt-image-2.5` or a combo name. */
export function nineRouterModel(id: string): string {
  return id.slice(NINEROUTER_IMAGE_PREFIX.length)
}

export function nineRouterImageId(model: string): string {
  return NINEROUTER_IMAGE_PREFIX + model.trim()
}

/** The Gemini API model id, e.g. `gemini-3.1-flash-image`. */
export function geminiImageModel(id: string): string {
  return id.slice(GEMINI_IMAGE_PREFIX.length)
}

export function geminiImageId(model: string): string {
  return GEMINI_IMAGE_PREFIX + model.trim()
}

/** 9Router and Gemini choices are kept as they are; Higgsfield ids dropped from the catalog fall back to the default. */
export function normalizeImageModel(id: string | null | undefined): string {
  return imageSource(id) === 'higgsfield' ? getImageModel(id).id : id!
}

export function imageModelLabel(id: string | null | undefined): string {
  if (isNineRouterImage(id)) return `${nineRouterModel(id)} (9Router)`
  if (isGeminiImage(id)) return `${geminiImageModel(id)} (Gemini)`
  return getImageModel(id).name
}

/** Where the pictures of a one-click run are drawn, for the start dialogs. */
export function imageSourceSentence(id: string | null | undefined): string {
  const source = imageSource(id)
  if (source === 'ninerouter') return 'Gambar dibuat lewat 9Router. '
  if (source === 'gemini') return 'Gambar dibuat lewat Gemini API dan ditagih ke akun Google AI Studio kamu. '
  return 'Gambar dibuat lewat Higgsfield dan memakai kredit. '
}

/** The same, as a short aside after "Gambar AI hanya dibuat untuk adegan yang membutuhkannya". */
export function imageSourceAside(id: string | null | undefined): string {
  const source = imageSource(id)
  if (source === 'ninerouter') return ' (lewat 9Router)'
  if (source === 'gemini') return ' (lewat Gemini API)'
  return ' (memakai kredit Higgsfield)'
}

/**
 * 9Router passes `images` on to providers that can draw from references (Codex/GPT Image, Gemini, Antigravity,
 * NanoBanana, ...) and drops them for plain OpenAI-style ones. The app cannot tell which provider is behind a model
 * id, so it always sends a few sheets and tells the user faces may drift.
 */
export const NINEROUTER_MAX_REFS = 4

/**
 * Gemini image models take many reference pictures, but every sheet adds about a megabyte to a request the API caps
 * at 20 MB, and a scene rarely shows more than four characters.
 */
export const GEMINI_MAX_REFS = 4

/** How many character sheets an image model takes as references. 0 means sheets are not made or sent. */
export function imageRefLimit(id: string | null | undefined): number {
  const source = imageSource(id)
  if (source === 'ninerouter') return NINEROUTER_MAX_REFS
  if (source === 'gemini') return GEMINI_MAX_REFS
  return maxRefs(getImageModel(id))
}

/**
 * The frame request for 9Router. `size` is OpenAI's landscape/portrait size, the only non-square one GPT Image
 * accepts (9Router turns it into 3:2 for providers that take a ratio); providers that read `aspect_ratio`
 * (Antigravity/Gemini) get the exact frame. Any leftover crop is absorbed by the cover-fit of preview and export.
 */
export function nineRouterFrame(aspect: AspectRatio): { size: string; aspect_ratio: AspectRatio } {
  return { size: aspect === '9:16' ? '1024x1536' : '1536x1024', aspect_ratio: aspect }
}
