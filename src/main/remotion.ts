import { randomBytes } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, join, normalize, sep } from 'node:path'
import { ensureBrowser, makeCancelSignal, renderMedia, selectComposition } from '@remotion/renderer'
import type { RenderEngineStatus, RenderTestResult } from '@shared/render'
import { emit } from './events'
import { dataDir, fontsDir, projectDir, remotionBinariesDir, remotionBundleDir } from './paths'
import { getSecret } from './secrets'

/**
 * Remotion renders explainer videos: a prebuilt bundle (src/remotion) runs in Chrome Headless Shell, which
 * screenshots each frame, and Remotion's compositor encodes them with the audio into an MP4.
 *
 * Chrome Headless Shell is downloaded once into the data folder. Remotion picks its download folder from
 * process.cwd() (the nearest package.json, then node_modules/.remotion). The installed app's working directory
 * can be Program Files, which is not writable, so the download runs from a folder of our own that holds a stub
 * package.json, and every render passes the resulting executable path explicitly.
 */

const CHROME_MODE = 'headless-shell' as const

function browserRoot(): string {
  const dir = join(dataDir(), 'render-browser')
  mkdirSync(dir, { recursive: true })
  const pkg = join(dir, 'package.json')
  if (!existsSync(pkg)) writeFileSync(pkg, '{ "name": "story-maker-render-browser", "private": true }\n')
  return dir
}

const installedFile = (): string => join(browserRoot(), 'installed.json')

interface Installed {
  path: string
  sizeBytes: number
}

function readInstalled(): Installed | null {
  try {
    const v = JSON.parse(readFileSync(installedFile(), 'utf8')) as Installed
    return v.path && existsSync(v.path) ? v : null
  } catch {
    return null
  }
}

function folderSize(path: string): number {
  const st = statSync(path)
  if (!st.isDirectory()) return st.size
  return readdirSync(path).reduce((n, name) => n + folderSize(join(path, name)), 0)
}

let download: { received: number; total: number } | null = null
let lastError: string | null = null
let installing: Promise<string> | null = null

export function renderEngineStatus(): RenderEngineStatus {
  if (download) return { state: 'downloading', received: download.received, total: download.total, sizeBytes: null, error: null }
  const inst = readInstalled()
  return { state: inst ? 'ready' : 'missing', received: 0, total: 0, sizeBytes: inst?.sizeBytes ?? null, error: inst ? null : lastError }
}

/**
 * Makes sure Chrome Headless Shell is installed and returns its executable. Remotion checks the installed
 * version on every call, so an app update that needs a newer browser downloads it again here.
 */
export function ensureRenderBrowser(onProgress?: (received: number, total: number) => void): Promise<string> {
  if (installing) return installing
  installing = (async () => {
    const root = browserRoot()
    const previous = process.cwd()
    lastError = null
    let lastEmit = 0
    try {
      process.chdir(root)
      const status = await ensureBrowser({
        chromeMode: CHROME_MODE,
        logLevel: 'error',
        onBrowserDownload: () => {
          download = { received: 0, total: 0 }
          emit.renderEngine(renderEngineStatus())
          return {
            version: null,
            onProgress: ({ downloadedBytes, totalSizeInBytes }) => {
              download = { received: downloadedBytes, total: totalSizeInBytes }
              onProgress?.(downloadedBytes, totalSizeInBytes)
              if (Date.now() - lastEmit > 250) {
                lastEmit = Date.now()
                emit.renderEngine(renderEngineStatus())
              }
            }
          }
        }
      })
      if (status.type !== 'local-puppeteer-browser' && status.type !== 'user-defined-path')
        throw new Error('Mesin render tidak bisa dipasang. Periksa koneksi internet lalu coba lagi.')
      const known = readInstalled()
      if (known?.path !== status.path || !known.sizeBytes) {
        const folder = join(root, 'node_modules', '.remotion')
        writeFileSync(installedFile(), JSON.stringify({ path: status.path, sizeBytes: existsSync(folder) ? folderSize(folder) : 0 }))
      }
      return status.path
    } catch (e) {
      lastError = `Gagal mengunduh mesin render: ${(e as Error).message}`
      throw new Error(lastError)
    } finally {
      process.chdir(previous)
      download = null
      installing = null
      emit.renderEngine(renderEngineStatus())
    }
  })()
  return installing
}

export function removeRenderBrowser(): void {
  if (installing) throw new Error('Tunggu sampai unduhan mesin render selesai.')
  const root = browserRoot()
  rmSync(join(root, 'node_modules'), { recursive: true, force: true })
  rmSync(installedFile(), { force: true })
  emit.renderEngine(renderEngineStatus())
}

// ---------- assets for the headless browser ----------

const TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2'
}

export interface AssetServer {
  /** Prefix for a project file's relative path, e.g. `${assetBase}images/x.png`. */
  assetBase: string
  /** Prefix for a font file name. */
  fontBase: string
  close(): Promise<void>
}

/**
 * The headless browser cannot load studio:// URLs, so a render gets a short-lived HTTP server on 127.0.0.1
 * with a random port and a random path prefix. It serves only the project's folder and the bundled fonts,
 * and stops when the render ends.
 */
export async function startAssetServer(projectId: string | null): Promise<AssetServer> {
  const token = randomBytes(16).toString('hex')
  const roots: Record<string, string> = { fonts: fontsDir() }
  if (projectId) roots.asset = projectDir(projectId)
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const parts = url.pathname.split('/').filter(Boolean)
    const root = parts[0] === token ? roots[parts[1]] : undefined
    if (!root || (req.method !== 'GET' && req.method !== 'HEAD')) {
      res.writeHead(404).end()
      return
    }
    let abs: string
    try {
      abs = normalize(join(root, ...parts.slice(2).map(decodeURIComponent)))
    } catch {
      res.writeHead(400).end()
      return
    }
    if (!abs.startsWith(normalize(root) + sep)) {
      res.writeHead(403).end()
      return
    }
    let size: number
    try {
      const st = statSync(abs)
      if (!st.isFile()) throw new Error('not a file')
      size = st.size
    } catch {
      res.writeHead(404).end()
      return
    }
    // Fonts are fetched across origins (the bundle is served from Remotion's own port).
    const headers: Record<string, string> = {
      'Content-Type': TYPES[extname(abs).toLowerCase()] ?? 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
      'Accept-Ranges': 'bytes'
    }
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '')
    let start = 0
    let end = size - 1
    if (m) {
      start = m[1] ? parseInt(m[1], 10) : Math.max(0, size - parseInt(m[2], 10))
      end = m[1] && m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1
      if (start >= size || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end()
        return
      }
      headers['Content-Range'] = `bytes ${start}-${end}/${size}`
    }
    headers['Content-Length'] = String(end - start + 1)
    res.writeHead(m ? 206 : 200, headers)
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    createReadStream(abs, { start, end })
      .on('error', () => res.destroy())
      .pipe(res)
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const { port } = server.address() as AddressInfo
  const base = `http://127.0.0.1:${port}/${token}`
  return {
    assetBase: `${base}/asset/`,
    fontBase: `${base}/fonts/`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      })
  }
}

// ---------- rendering ----------

export interface RenderRequest {
  compositionId: string
  inputProps: Record<string, unknown>
  outputPath: string
  /** Output size relative to the composition (1 = 1080p). */
  scale?: number
  signal: AbortSignal
  /** Overall progress 0–1 and a message for the job. */
  onProgress(p: number, message: string): void
}

const mb = (n: number): string => `${Math.round(n / 1_000_000)} MB`

/** Renders a composition of the bundle to an H.264 MP4 (AAC audio). Rejects when `signal` aborts. */
export async function renderVideo(req: RenderRequest): Promise<void> {
  const bundle = remotionBundleDir()
  if (!existsSync(join(bundle, 'index.html'))) throw new Error('Bundle video belum dibuat. Jalankan npm run build lalu buka lagi aplikasinya.')
  const browserExecutable = await ensureRenderBrowser((received, total) =>
    req.onProgress(0.05 * (total ? received / total : 0), `Mengunduh mesin render (${mb(received)} dari ${mb(total)})`)
  )
  if (req.signal.aborted) throw new Error('Dibatalkan')
  // Companies above the free tier add their Remotion Company License key in Settings. With a key, Remotion
  // reports each finished render to remotion.pro (the key, success, nothing about the video) before it
  // resolves; a failed report is only logged by Remotion and never fails the render. Without a key nothing is
  // sent, as before. getSecret throws a readable message when a stored key can no longer be decrypted.
  const licenseKey = getSecret('remotion')
  const { cancelSignal, cancel } = makeCancelSignal()
  const onAbort = (): void => cancel()
  req.signal.addEventListener('abort', onAbort)
  const common = {
    serveUrl: bundle,
    inputProps: req.inputProps,
    browserExecutable,
    binariesDirectory: remotionBinariesDir(),
    chromeMode: CHROME_MODE,
    logLevel: 'error' as const,
    onBrowserLog: (log: { type: string; text: string }) => {
      if (log.type === 'error' || log.type === 'warning') console.warn('[remotion browser]', log.text)
    }
  }
  try {
    req.onProgress(0.05, 'Menyiapkan render')
    const composition = await selectComposition({ ...common, id: req.compositionId })
    if (req.signal.aborted) throw new Error('Dibatalkan')
    const frames = composition.durationInFrames
    await renderMedia({
      ...common,
      composition,
      codec: 'h264',
      audioCodec: 'aac',
      audioBitrate: '192k',
      outputLocation: req.outputPath,
      overwrite: true,
      scale: req.scale ?? 1,
      // A video without any voice or music still gets a (silent) track, so the loudness pass has audio to read.
      enforceAudioTrack: true,
      imageFormat: 'jpeg',
      jpegQuality: 92,
      cancelSignal,
      ...(licenseKey ? { licenseKey } : {}),
      onProgress: ({ progress, renderedFrames, stitchStage }) => {
        const msg =
          licenseKey && progress >= 1
            ? 'Mencatat pemakaian lisensi Remotion'
            : stitchStage === 'muxing' || renderedFrames >= frames
              ? 'Menyatukan gambar dan suara'
              : `Merender frame ${renderedFrames} dari ${frames}`
        req.onProgress(0.06 + 0.84 * progress, msg)
      }
    })
  } finally {
    req.signal.removeEventListener('abort', onAbort)
  }
}

/** Renders the two-second test composition, so a user (or a tester on Windows) can check the whole engine. */
export async function renderTest(): Promise<RenderTestResult> {
  const started = Date.now()
  const out = join(dataDir(), 'tmp', 'render-test.mp4')
  mkdirSync(join(dataDir(), 'tmp'), { recursive: true })
  const server = await startAssetServer(null)
  try {
    await renderVideo({
      compositionId: 'RenderTest',
      inputProps: { fontBase: server.fontBase },
      outputPath: out,
      signal: new AbortController().signal,
      onProgress: () => {}
    })
  } finally {
    await server.close()
  }
  return { ms: Date.now() - started, path: out, bytes: statSync(out).size }
}
