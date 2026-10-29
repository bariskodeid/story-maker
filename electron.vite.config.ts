import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const shared = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: {
    resolve: { alias: shared }
  },
  preload: {
    resolve: { alias: shared }
  },
  renderer: {
    resolve: {
      // @video: the Remotion compositions, which the app's Player mounts directly (the render uses the bundle).
      alias: { ...shared, '@renderer': resolve('src/renderer/src'), '@video': resolve('src/remotion') }
    },
    plugins: [react(), tailwindcss()]
  }
})
