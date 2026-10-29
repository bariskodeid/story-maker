import { writeFileSync } from 'node:fs'
import { ensureBrowser } from '@remotion/renderer'

/**
 * Runs Remotion's ensureBrowser in an Electron utility process (started by ensureRenderBrowser in remotion.ts).
 *
 * ensureBrowser cannot be cancelled: it gives its download a signal that never aborts. Killing this process is the
 * only way to stop a download, and nothing it opened outlives it. The process starts in the render-browser folder,
 * because Remotion picks its download folder from process.cwd().
 */

export type BrowserWorkerMessage =
  /** A download is starting (nothing installed, or an older version). */
  | { type: 'download' }
  | { type: 'progress'; received: number; total: number }
  | { type: 'done'; path: string }
  | { type: 'error'; message: string }

// The main process looks for this file (PARTIAL in remotion.ts). It is written before Remotion fetches a single
// byte, so a download that is killed, crashes, or dies with the app is always recognized and removed.
const PARTIAL = 'download-incomplete'

const send = (m: BrowserWorkerMessage): void => process.parentPort.postMessage(m)
let lastProgress = 0

ensureBrowser({
  // Same mode as CHROME_MODE in remotion.ts, which every render uses.
  chromeMode: 'headless-shell',
  logLevel: 'error',
  onBrowserDownload: () => {
    writeFileSync(PARTIAL, '')
    send({ type: 'download' })
    return {
      version: null,
      onProgress: ({ downloadedBytes, totalSizeInBytes }) => {
        // Remotion reports every network chunk; a few updates a second are plenty for a progress bar.
        const now = Date.now()
        if (now - lastProgress < 100 && downloadedBytes < totalSizeInBytes) return
        lastProgress = now
        send({ type: 'progress', received: downloadedBytes, total: totalSizeInBytes })
      }
    }
  }
}).then(
  (status) =>
    send(
      status.type === 'local-puppeteer-browser' || status.type === 'user-defined-path'
        ? { type: 'done', path: status.path }
        : { type: 'error', message: 'Mesin render tidak bisa dipasang. Periksa koneksi internet lalu coba lagi.' }
    ),
  (e: unknown) => send({ type: 'error', message: e instanceof Error ? e.message : String(e) })
)
