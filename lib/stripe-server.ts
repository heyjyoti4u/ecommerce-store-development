import 'server-only'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

let stripeInstance: Stripe | undefined

export function getStripeServerClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) throw new Error('Stripe is not configured for this deployment.')
  stripeInstance ??= new Stripe(secretKey)
  return stripeInstance
}

export function getSupabaseServiceClient() {
  const url = process.env.ECOMMERCE_STORE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_ECOMMERCE_STORE_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.ECOMMERCE_STORE_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Supabase order processing is not configured for this deployment.')
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

export function getSupabaseAnonKey() {
  return process.env.NEXT_PUBLIC_ECOMMERCE_STORE_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_ECOMMERCE_STORE_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY
}
