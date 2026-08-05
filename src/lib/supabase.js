import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anon) {
  console.warn('[GranVendas] Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env')
}

export const supabase = createClient(url || 'https://placeholder.supabase.co', anon || 'placeholder', {
  auth: { persistSession: true, autoRefreshToken: true }
})

export const supabaseConfigurado = Boolean(url && anon && !url.includes('SEU-PROJETO'))
