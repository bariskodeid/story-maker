/**
 * Splits text into pieces of at most `max` characters for voices that only read short inputs, cutting at sentence
 * ends first, then at commas or semicolons, then between words, so each piece still sounds like a natural phrase.
 * Only a single word longer than `max` is cut mid-word.
 */
export function splitSpeech(text: string, max: number): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  if (clean.length <= max) return [clean]

  const pieces: string[] = []
  const fit = (part: string, breaks: RegExp[]): void => {
    if (part.length <= max) return void pieces.push(part)
    const [cut, ...rest] = breaks
    if (!cut) {
      for (let i = 0; i < part.length; i += max) pieces.push(part.slice(i, i + max))
      return
    }
    for (const sub of part.split(cut).filter(Boolean)) fit(sub.trim(), rest)
  }
  // The lookbehinds keep each punctuation mark on the piece it ends.
  fit(clean, [/(?<=[.!?…])\s+/, /(?<=[,;:])\s+/, /\s+/])

  // Short neighbours are joined again, so the voice gets as few requests and joins as possible.
  const out: string[] = []
  for (const p of pieces) {
    const last = out[out.length - 1]
    if (last !== undefined && last.length + 1 + p.length <= max) out[out.length - 1] = `${last} ${p}`
    else out.push(p)
  }
  return out
}
