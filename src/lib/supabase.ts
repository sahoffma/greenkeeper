import { createClient } from '@supabase/supabase-js'

function readEnv(name: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'): string {
  const value = import.meta.env[name]?.trim()

  if (!value) {
    throw new Error(
      `${name} fehlt. Trage den Wert in .env.local ein (siehe .env.example). Bei netlify dev werden .env.local und .env geladen.`,
    )
  }

  if (value === 'your-anon-key') {
    throw new Error(
      'VITE_SUPABASE_ANON_KEY ist noch ein Platzhalter. Trage den anon public Key aus dem Supabase-Dashboard ein.',
    )
  }

  return value
}

const supabaseUrl = readEnv('VITE_SUPABASE_URL')
const supabaseAnonKey = readEnv('VITE_SUPABASE_ANON_KEY')

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
