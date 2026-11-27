import 'server-only'
import { createClient } from '@supabase/supabase-js'

let supabaseService: ReturnType<typeof createClient<any>> | undefined

export function getRazorpayCredentials() {
  const keyId = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET
  if (!keyId || !keySecret) throw new Error('Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.')
  return { keyId, keySecret }
}

export async function razorpayRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const { keyId, keySecret } = getRazorpayCredentials()
  const response = await fetch(`https://api.razorpay.com/v1/${path.replace(/^\/+/, '')}`, {
    ...init,
    cache: 'no-store',
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = result?.error?.description || result?.error?.reason || 'Razorpay request failed.'
    throw new Error(message)
  }
  return result as T
}

export function getSupabaseServiceClient() {
  const url = process.env.ECOMMERCE_STORE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_ECOMMERCE_STORE_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.ECOMMERCE_STORE_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Supabase order processing is not configured for this deployment.')
  supabaseService ??= createClient<any>(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  return supabaseService
}

export function getSupabaseAnonKey() {
  return process.env.NEXT_PUBLIC_ECOMMERCE_STORE_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_ECOMMERCE_STORE_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY
}
