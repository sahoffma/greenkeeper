/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /** true = Fotoerkennung im Düngererfassungsflow (/ausruestung/duenger/erfassen) */
  readonly VITE_PRODUCT_RECOGNITION_ENABLED?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
