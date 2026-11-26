import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const url = process.env.ECOMMERCE_STORE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_ECOMMERCE_STORE_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.ECOMMERCE_STORE_SUPABASE_SECRET_KEY ?? process.env.ECOMMERCE_STORE_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Supabase is not connected to this deployment yet.' }, { status: 503 })

  let payload: unknown
  try { payload = await request.json() } catch { return NextResponse.json({ error: 'Please check your checkout details and try again.' }, { status: 400 }) }
  if (!payload || typeof payload !== 'object') return NextResponse.json({ error: 'Invalid checkout details.' }, { status: 400 })
  const body = payload as Record<string, unknown>
  const customer = body.customer as Record<string, unknown> | undefined
  const items = body.items
  if (!customer || !Array.isArray(items) || items.length < 1 || items.length > 30) return NextResponse.json({ error: 'Your bag is empty or has too many items.' }, { status: 400 })
  const required = ['name', 'email', 'phone', 'address', 'city', 'state', 'postal']
  if (required.some((field) => typeof customer[field] !== 'string' || !String(customer[field]).trim() || String(customer[field]).length > 240)) return NextResponse.json({ error: 'Please complete all delivery details.' }, { status: 400 })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(customer.email)) || !/^[6-9]\d{9}$/.test(String(customer.phone).replace(/\D/g, '')) || !/^\d{6}$/.test(String(customer.postal))) return NextResponse.json({ error: 'Enter a valid email, 10-digit Indian mobile number and 6-digit PIN code.' }, { status: 400 })
  const normalized = new Map<string, { product_id: string; size: string; color: string; quantity: number }>()
  for (const item of items) {
    if (!item || typeof item !== 'object') return NextResponse.json({ error: 'Invalid item in your bag.' }, { status: 400 })
    const line = item as Record<string, unknown>
    const productId = typeof line.product_id === 'string' ? line.product_id : ''
    const size = typeof line.size === 'string' ? line.size.slice(0, 40) : ''
    const color = typeof line.color === 'string' ? line.color.slice(0, 40) : ''
    const quantity = Number(line.quantity)
    if (!productId || !size || !color || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) return NextResponse.json({ error: 'A product option or quantity is invalid.' }, { status: 400 })
    const key = `${productId}:${size}:${color}`
    const previous = normalized.get(key)
    const totalQuantity = (previous?.quantity ?? 0) + quantity
    if (totalQuantity > 10) return NextResponse.json({ error: 'Maximum 10 of each product option per order.' }, { status: 400 })
    normalized.set(key, { product_id: productId, size, color, quantity: totalQuantity })
  }

  const authorization = request.headers.get('authorization')
  let data: { order_number: string; total: number } | null = null
  let error: { message: string } | null = null

  if (authorization?.startsWith('Bearer ')) {
    const anonKey = process.env.NEXT_PUBLIC_ECOMMERCE_STORE_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY
    if (!anonKey) return NextResponse.json({ error: 'Supabase anon key is missing for account checkout.' }, { status: 503 })
    const token = authorization.slice(7)
    const accountClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization } },
    })
    const { data: authData, error: authError } = await accountClient.auth.getUser(token)
    if (authError || !authData.user) return NextResponse.json({ error: 'Please sign in again before placing your order.' }, { status: 401 })
    const { error: profileError } = await accountClient.from('customer_profiles').update({
      full_name: String(customer.name).trim(),
      phone: String(customer.phone).replace(/\D/g, '').slice(-10),
      address: String(customer.address).trim(),
      city: String(customer.city).trim(),
      state: String(customer.state).trim(),
      postal_code: String(customer.postal).trim(),
      updated_at: new Date().toISOString(),
    }).eq('user_id', authData.user.id)
    if (profileError) return NextResponse.json({ error: 'Please complete your saved profile details before placing the order.' }, { status: 400 })
    const result = await accountClient.rpc('create_account_order', { p_items: [...normalized.values()] })
    data = result.data
    error = result.error
  } else {
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const result = await supabase.rpc('create_guest_order', {
      p_customer: Object.fromEntries(required.map((field) => [field, field === 'phone' ? String(customer[field]).replace(/\D/g, '').slice(-10) : String(customer[field]).trim()])),
      p_items: [...normalized.values()],
      p_payment_method: 'cod',
    })
    data = result.data
    error = result.error
  }
  if (error || !data) {
    console.error('[orders] Supabase order creation failed:', error?.message ?? 'No order returned')
    return NextResponse.json({ error: 'We could not save your order. Please try again in a moment.' }, { status: 503 })
  }
  return NextResponse.json({ orderNumber: data.order_number, total: Number(data.total), currency: 'INR' }, { status: 201 })
}
