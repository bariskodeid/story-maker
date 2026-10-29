import { getImageModel, maxRefs } from './higgsfield'
import type { AspectRatio } from './types'

/**
 * Clip images and character sheets come from Higgsfield's catalog or from an image model the user connected in
 * 9Router. A project keeps a 9Router choice as `9router:<model id>` in the same `imageModel` field, so no
 * migration is needed and every Higgsfield id keeps its meaning. Video always stays on Higgsfield.
 */
export const NINEROUTER_IMAGE_PREFIX = '9router:'

export function isNineRouterImage(id: string | null | undefined): id is string {
  return !!id && id.startsWith(NINEROUTER_IMAGE_PREFIX) && id.length > NINEROUTER_IMAGE_PREFIX.length
}

/** The id 9Router routes on, e.g. `cx/gpt-image-2.5` or a combo name. */
export function nineRouterModel(id: string): string {
  return id.slice(NINEROUTER_IMAGE_PREFIX.length)
}

export function nineRouterImageId(model: string): string {
  return NINEROUTER_IMAGE_PREFIX + model.trim()
}

/** 9Router choices are kept as they are; Higgsfield ids dropped from the catalog fall back to the default. */
export function normalizeImageModel(id: string | null | undefined): string {
  return isNineRouterImage(id) ? id : getImageModel(id).id
}

export function imageModelLabel(id: string | null | undefined): string {
  return isNineRouterImage(id) ? `${nineRouterModel(id)} (9Router)` : getImageModel(id).name
}

/**
 * 9Router passes `images` on to providers that can draw from references (Codex/GPT Image, Gemini, Antigravity,
 * NanoBanana, ...) and drops them for plain OpenAI-style ones. The app cannot tell which provider is behind a model
 * id, so it always sends a few sheets and tells the user faces may drift.
 */
export const NINEROUTER_MAX_REFS = 4

/** How many character sheets an image model takes as references. 0 means sheets are not made or sent. */
export function imageRefLimit(id: string | null | undefined): number {
  return isNineRouterImage(id) ? NINEROUTER_MAX_REFS : maxRefs(getImageModel(id))
}

/**
 * The frame request for 9Router. `size` is OpenAI's landscape/portrait size, the only non-square one GPT Image
 * accepts (9Router turns it into 3:2 for providers that take a ratio); providers that read `aspect_ratio`
 * (Antigravity/Gemini) get the exact frame. Any leftover crop is absorbed by the cover-fit of preview and export.
 */
export function nineRouterFrame(aspect: AspectRatio): { size: string; aspect_ratio: AspectRatio } {
  return { size: aspect === '9:16' ? '1024x1536' : '1536x1024', aspect_ratio: aspect }
}
