import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

const rootDir = dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  // loadEnv merges .env, .env.local, .env.[mode], .env.[mode].local
  // (.env.local overrides .env). Netlify Dev may inject .env into process.env
  // before Vite starts – explicit define ensures file values reach the client.
  const env = loadEnv(mode, rootDir, 'VITE_')

  const envDefine = Object.fromEntries(
    Object.keys(env).map((key) => [`import.meta.env.${key}`, JSON.stringify(env[key])]),
  )

  return {
    plugins: [react()],
    envDir: rootDir,
    define: envDefine,
  }
})
