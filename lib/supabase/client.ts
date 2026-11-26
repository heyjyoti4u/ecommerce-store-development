import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let browserClient: SupabaseClient | null = null

export function getSupabaseBrowserClient() {
  // Vercel's Supabase integration prefixes variables with the integration name.
  // Keep the standard names as fallbacks for local development and manual setup.
  const url =
    process.env.NEXT_PUBLIC_ECOMMERCE_STORE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.NEXT_PUBLIC_ECOMMERCE_STORE_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      'Supabase is not configured. Connect the Supabase integration in Vercel and make sure its NEXT_PUBLIC_ECOMMERCE_STORE_SUPABASE_URL and NEXT_PUBLIC_ECOMMERCE_STORE_SUPABASE_ANON_KEY variables are available to this deployment.'
    )
  }

  if (!browserClient) browserClient = createClient(url, key)
  return browserClient
}
