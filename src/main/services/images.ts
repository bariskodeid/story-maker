import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import ffmpegStatic from 'ffmpeg-static'
import { binPath } from '../paths'

/** Image providers send PNG, JPEG or WebP without always saying which; the bytes tell. */
export function imageType(bytes: Buffer): { ext: string; mime: string } | null {
  if (bytes.length > 8 && bytes.readUInt32BE(0) === 0x89504e47) return { ext: '.png', mime: 'image/png' }
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ext: '.jpg', mime: 'image/jpeg' }
  if (bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return { ext: '.webp', mime: 'image/webp' }
  return null
}

/**
 * A character sheet as a JPEG data URI, at most 1536 px wide. Sheets can be several MB as PNG, and Gemini-based
 * providers refuse requests above about 20 MB.
 */
export async function inlineReference(absPath: string): Promise<string> {
  const jpeg = await new Promise<Buffer>((resolve, reject) => {
    execFile(
      binPath(ffmpegStatic!),
      ['-hide_banner', '-loglevel', 'error', '-i', absPath, '-vf', "scale='min(1536,iw)':-2", '-frames:v', '1', '-q:v', '3', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-'],
      { windowsHide: true, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 },
      (err, stdout) => (err || !stdout.length ? reject(err ?? new Error('empty')) : resolve(stdout))
    )
  }).catch(() => null)
  if (jpeg) return `data:image/jpeg;base64,${jpeg.toString('base64')}`
  const bytes = await readFile(absPath)
  return `data:${imageType(bytes)?.mime ?? 'image/png'};base64,${bytes.toString('base64')}`
}
