import { useEffect, useState } from 'react'
import { continueRender, delayRender } from 'remotion'

export interface FontSpec {
  family: string
  file: string
  weight?: number | string
}

const loaded = new Map<string, Promise<void>>()

function loadFont(base: string, f: FontSpec): Promise<void> {
  const key = `${base}|${f.family}|${f.file}|${f.weight ?? 400}`
  let p = loaded.get(key)
  if (!p) {
    const face = new FontFace(f.family, `url("${base}${f.file}")`, { weight: String(f.weight ?? 400) })
    p = face.load().then((ff) => {
      document.fonts.add(ff)
    })
    loaded.set(key, p)
  }
  return p
}

/**
 * Loads font files from `base` (studio://fonts/ in the app, the render's local asset server during an export).
 * A render waits for them through delayRender, so no frame is captured with a fallback font.
 */
export function useFonts(base: string, fonts: FontSpec[]): boolean {
  const key = fonts.map((f) => `${f.family}:${f.file}`).join(',')
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const handle = delayRender(`Font ${key}`)
    let alive = true
    // A missing font must not hang the render; the text falls back to the next family in the stack.
    Promise.allSettled(fonts.map((f) => loadFont(base, f))).then(() => {
      if (alive) setReady(true)
      continueRender(handle)
    })
    return () => {
      alive = false
      continueRender(handle)
    }
  }, [base, key])
  return ready
}
