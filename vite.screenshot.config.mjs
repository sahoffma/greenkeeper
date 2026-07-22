import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const rootDir = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  root: resolve(rootDir, 'scripts/screenshot'),
  resolve: {
    alias: {
      '/src': resolve(rootDir, 'src'),
    },
  },
  server: {
    port: 5199,
    strictPort: true,
  },
})
