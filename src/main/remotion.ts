import { randomBytes } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, join, normalize, sep } from 'node:path'
import { makeCancelSignal, renderMedia, selectComposition } from '@remotion/renderer'
import { utilityProcess, type UtilityProcess } from 'electron'
import type { RenderEngineStatus, RenderTestResult } from '@shared/render'
import { emit } from './events'
import { dataDir, fontsDir, projectDir, remotionBinariesDir, remotionBundleDir } from './paths'
import type { BrowserWorkerMessage } from './renderBrowserWorker'
import browserWorker from './renderBrowserWorker?modulePath'
import { getSecret } from './secrets'

/**
 * Remotion renders explainer videos: a prebuilt bundle (src/remotion) runs in Chrome Headless Shell, which
 * screenshots each frame, and Remotion's compositor encodes them with the audio into an MP4.
 *
 * Chrome Headless Shell is downloaded once into the data folder. Remotion picks its download folder from
 * process.cwd() (the nearest package.json, then node_modules/.remotion). The installed app's working directory
 * can be Program Files, which is not writable, so the download runs from a folder of our own that holds a stub
 * package.json, and every render passes the resulting executable path explicitly.
 *
 * ensureBrowser itself runs in an Electron utility process (renderBrowserWorker.ts), never in this one:
 * - its download cannot be cancelled (Remotion hands it a signal that never aborts), so cancelling kills that
 *   process, and nothing it opened outlives it;
 * - the process starts in the folder above, so this one never changes its own working directory;
 * - Remotion chains each ensureBrowser call onto the previous one with .then, so a single failed call here would
 *   fail every later one, including the call inside each renderMedia, until the app restarts.
 * A utility process rather than child_process.fork with ELECTRON_RUN_AS_NODE: it is Electron's supported way to
 * run Node code in a process of its own, loads the script from inside app.asar, does not depend on the runAsNode
 * fuse, and is ended together with the app.
 */

const CHROME_MODE = 'headless-shell' as const
// Written by renderBrowserWorker.ts before a download fetches anything; removed once the browser is installed.
const PARTIAL = 'download-incomplete'

function browserRoot(): string {
  const dir = join(dataDir(), 'render-browser')
  mkdirSync(dir, { recursive: true })
  const pkg = join(dir, 'package.json')
  if (!existsSync(pkg)) writeFileSync(pkg, '{ "name": "story-maker-render-browser", "private": true }\n')
  return dir
}

const installedFile = (): string => join(browserRoot(), 'installed.json')
const partialFile = (): string => join(browserRoot(), PARTIAL)

interface Installed {
  path: string
  sizeBytes: number
}

function readInstalled(): Installed | null {
  // A download that never finished can leave a browser folder behind; that is not an installed browser.
  if (existsSync(partialFile())) return null
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

/**
 * Removes the browser and anything a download wrote. The marker goes last: while a file is still locked (Windows,
 * antivirus), the marker stays and the next download clears the folder before it starts.
 */
function clearBrowserFolder(retry = true): void {
  rmSync(join(browserRoot(), 'node_modules'), { recursive: true, force: true, ...(retry ? { maxRetries: 5, retryDelay: 200 } : {}) })
  rmSync(installedFile(), { force: true })
  rmSync(partialFile(), { force: true })
}

interface Waiter {
  onProgress?: (received: number, total: number) => void
}

/** One ensureBrowser in a utility process: a quick version check, and a download when one is needed. */
interface Run {
  /** Null before the process is forked and after it exited. */
  child: UtilityProcess | null
  /** Renders (and the Settings button) waiting for this run. */
  waiters: Set<Waiter>
  /** Started or joined from Settings: a cancelled export leaves it running; only Batalkan there stops it. */
  manual: boolean
  downloading: boolean
  received: number
  total: number
  cancelled: boolean
  result: Promise<string>
}

let run: Run | null = null
/** The latest run including its cleanup. A new run waits for it, so two runs never touch the folder at once. */
let previous: Promise<unknown> = Promise.resolve()
/** The executable a run confirmed in this session; the browser version Remotion wants cannot change meanwhile. */
let verified: string | null = null
let lastError: string | null = null
let lastCancelled = false
let lastEmit = 0

export function renderEngineStatus(): RenderEngineStatus {
  const inst = readInstalled()
  if (run && (run.downloading || !inst))
    return { state: 'downloading', received: run.received, total: run.total, sizeBytes: null, error: null, cancelled: false }
  return {
    state: inst ? 'ready' : 'missing',
    received: 0,
    total: 0,
    sizeBytes: inst?.sizeBytes ?? null,
    error: inst ? null : lastError,
    cancelled: !inst && lastCancelled
  }
}

function report(force = false): void {
  if (!force && Date.now() - lastEmit < 250) return
  lastEmit = Date.now()
  emit.renderEngine(renderEngineStatus())
}

export interface EnsureBrowserOptions {
  onProgress?: (received: number, total: number) => void
  /** A render's cancel signal: it stops waiting, and stops the download too when nothing else waits for it. */
  signal?: AbortSignal
  /** The download button in Settings. */
  manual?: boolean
}

/**
 * Makes sure Chrome Headless Shell is installed and returns its executable. Remotion checks the installed
 * version on every run, so an app update that needs a newer browser downloads it again here.
 */
export function ensureRenderBrowser({ onProgress, signal, manual }: EnsureBrowserOptions = {}): Promise<string> {
  if (signal?.aborted) return Promise.reject(new Error('Dibatalkan'))
  if (!run && verified && existsSync(verified) && !existsSync(partialFile())) return Promise.resolve(verified)
  const r = run ?? startRun()
  if (manual) r.manual = true
  const waiter: Waiter = { onProgress }
  r.waiters.add(waiter)
  return new Promise<string>((resolve, reject) => {
    const leave = (): void => {
      r.waiters.delete(waiter)
      signal?.removeEventListener('abort', onAbort)
    }
    const onAbort = (): void => {
      leave()
      reject(new Error('Dibatalkan'))
      // The first export downloads the browser by itself; cancelling that export cancels its download, unless
      // Settings or another render still waits for it.
      if (!r.manual && r.waiters.size === 0) void stopRun(r)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    r.result.then(
      (path) => {
        leave()
        resolve(path)
      },
      (e: unknown) => {
        leave()
        reject(e)
      }
    )
  })
}

function startRun(): Run {
  lastError = null
  lastCancelled = false
  const r: Run = {
    child: null,
    waiters: new Set(),
    manual: false,
    downloading: false,
    received: 0,
    total: 0,
    cancelled: false,
    result: Promise.resolve('')
  }
  const before = previous
  r.result = (async () => {
    await before.catch(() => {})
    try {
      if (r.cancelled) throw new Error('Dibatalkan')
      // Left by a download that was cut short when the app quit or crashed.
      if (existsSync(partialFile())) clearBrowserFolder()
      const path = await runWorker(r)
      rmSync(partialFile(), { force: true })
      const known = readInstalled()
      if (known?.path !== path || !known.sizeBytes) {
        const folder = join(browserRoot(), 'node_modules', '.remotion')
        writeFileSync(installedFile(), JSON.stringify({ path, sizeBytes: existsSync(folder) ? folderSize(folder) : 0 }))
      }
      verified = path
      return path
    } catch (e) {
      // The worker has exited by now, so nothing writes into the folder any more.
      if (existsSync(partialFile())) clearBrowserFolder()
      if (r.cancelled) throw new Error('Unduhan mesin render dibatalkan.')
      lastError = `Gagal mengunduh mesin render: ${(e as Error).message}`
      throw new Error(lastError)
    } finally {
      if (run === r) run = null
      report(true)
    }
  })()
  previous = r.result
  run = r
  report(true)
  return r
}

/** Forks the worker. Settles only once the process has exited, never while it may still write files. */
function runWorker(r: Run): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = utilityProcess.fork(browserWorker, [], { cwd: browserRoot(), serviceName: 'Story Maker render browser', stdio: 'inherit' })
    r.child = child
    let outcome: { path: string } | { error: string } | null = null
    // kill() does nothing before the process is up, so a run cancelled that early is stopped here.
    child.once('spawn', () => {
      if (r.cancelled) child.kill()
    })
    child.on('message', (m: BrowserWorkerMessage) => {
      if (m.type === 'download') {
        r.downloading = true
        report(true)
      } else if (m.type === 'progress') {
        r.downloading = true
        r.received = m.received
        r.total = m.total
        for (const w of r.waiters) w.onProgress?.(m.received, m.total)
        report()
      } else {
        outcome = m.type === 'done' ? { path: m.path } : { error: m.message }
        child.kill()
      }
    })
    child.once('exit', (code) => {
      r.child = null
      // A browser that finished installing is kept, even when Batalkan came a moment too late.
      if (outcome && 'path' in outcome) resolve(outcome.path)
      else if (r.cancelled) reject(new Error('Dibatalkan'))
      else reject(new Error(outcome?.error ?? `proses unduhan berhenti tiba-tiba (kode ${code}).`))
    })
  })
}

/** Kills the run's worker; resolves once it has exited and the partial download is gone. */
function stopRun(r: Run): Promise<void> {
  if (!r.cancelled) {
    r.cancelled = true
    lastCancelled = true
    if (run === r) run = null
    r.child?.kill()
    report(true)
  }
  return r.result.then(
    () => undefined,
    () => undefined
  )
}

/** The Batalkan button in Settings. Exports waiting for this download fail with a message that says so. */
export function cancelRenderBrowserDownload(): Promise<void> {
  if (run) return stopRun(run)
  return previous.then(
    () => undefined,
    () => undefined
  )
}

/**
 * Quitting the app: kill a running download and remove its files without waiting. If the dying process still
 * holds a file, the marker stays and the next download clears the folder first.
 */
export function stopRenderBrowserDownloadOnQuit(): void {
  const r = run
  if (!r) return
  r.cancelled = true
  run = null
  r.child?.kill()
  try {
    if (existsSync(partialFile())) clearBrowserFolder(false)
  } catch {
    // Cleared before the next download (see above).
  }
}

export function removeRenderBrowser(): void {
  if (run) throw new Error('Tunggu sampai unduhan mesin render selesai.')
  verified = null
  lastError = null
  lastCancelled = false
  clearBrowserFolder()
  report(true)
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
  const browserExecutable = await ensureRenderBrowser({
    signal: req.signal,
    onProgress: (received, total) =>
      req.onProgress(0.05 * (total ? received / total : 0), `Mengunduh mesin render (${mb(received)} dari ${mb(total)})`)
  })
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
