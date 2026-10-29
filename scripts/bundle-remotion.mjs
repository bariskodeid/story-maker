// Builds the Remotion bundle (src/remotion) into out/remotion. The main process renders videos from this
// prebuilt folder: Remotion's docs advise against calling bundle() inside a packaged Electron app.
//
//   node scripts/bundle-remotion.mjs             always rebuild
//   node scripts/bundle-remotion.mjs --if-stale  skip when nothing it depends on changed (used by npm run dev)
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bundle } from '@remotion/bundler'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'out', 'remotion')
const marker = join(outDir, 'index.html')

function newestMtime(path) {
  const st = statSync(path)
  if (!st.isDirectory()) return st.mtimeMs
  return readdirSync(path).reduce((max, name) => Math.max(max, newestMtime(join(path, name))), st.mtimeMs)
}

if (process.argv.includes('--if-stale') && existsSync(marker)) {
  const inputs = ['src/remotion', 'src/shared', 'scripts/bundle-remotion.mjs', 'package-lock.json'].map((p) => join(root, p))
  const newest = Math.max(...inputs.filter(existsSync).map(newestMtime))
  if (newest < statSync(marker).mtimeMs) {
    console.log('[remotion] bundle is up to date')
    process.exit(0)
  }
}

const started = Date.now()
rmSync(outDir, { recursive: true, force: true })
let last = -1
await bundle({
  entryPoint: join(root, 'src', 'remotion', 'index.ts'),
  outDir,
  // Compositions share timing, layout and caption rules with the app through src/shared. No source maps: when
  // bundle.js names one, the renderer reads it from disk before every render, and the installer leaves maps out.
  webpackOverride: (config) => ({
    ...config,
    devtool: false,
    resolve: { ...config.resolve, alias: { ...(config.resolve?.alias ?? {}), '@shared': join(root, 'src', 'shared') } }
  }),
  onProgress: (p) => {
    const step = Math.floor(p / 25)
    if (step !== last) {
      last = step
      console.log(`[remotion] bundling ${p}%`)
    }
  }
})
console.log(`[remotion] bundle written to out/remotion in ${((Date.now() - started) / 1000).toFixed(1)} s`)
