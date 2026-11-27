import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getRazorpayCredentials, razorpayRequest, getSupabaseAnonKey, getSupabaseServiceClient } from '@/lib/razorpay-server'

export const runtime = 'nodejs'
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const requiredFields = ['name', 'email', 'phone', 'address', 'city', 'state', 'postal'] as const

type RazorpayOrder = { id: string; amount: number; currency: string; status: string }

export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  if (origin && host) {
    try { if (new URL(origin).host !== host) return NextResponse.json({ error: 'Invalid checkout origin.' }, { status: 403 }) }
    catch { return NextResponse.json({ error: 'Invalid checkout origin.' }, { status: 403 }) }
  }
  if (Number(request.headers.get('content-length') ?? 0) > 64 * 1024) return NextResponse.json({ error: 'Checkout request is too large.' }, { status: 413 })

  const url = process.env.ECOMMERCE_STORE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_ECOMMERCE_STORE_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = getSupabaseAnonKey()
  const authorization = request.headers.get('authorization')
  if (!url || !anonKey) return NextResponse.json({ error: 'Supabase is not configured for checkout.' }, { status: 503 })
  if (!authorization?.startsWith('Bearer ')) return NextResponse.json({ error: 'Sign in and confirm your email before placing an order.' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await request.json() as Record<string, unknown> } catch { return NextResponse.json({ error: 'Invalid checkout details.' }, { status: 400 }) }
  const customer = body.customer as Record<string, unknown> | undefined
  const items = body.items
  const paymentMethod = body.paymentMethod
  const idempotencyKey = body.idempotencyKey
  if (!customer || !Array.isArray(items) || items.length < 1 || items.length > 30) return NextResponse.json({ error: 'Your bag is empty or has too many items.' }, { status: 400 })
  if (paymentMethod !== 'cod' && paymentMethod !== 'upi') return NextResponse.json({ error: 'Choose a supported payment method.' }, { status: 400 })
  if (typeof idempotencyKey !== 'string' || !uuidPattern.test(idempotencyKey)) return NextResponse.json({ error: 'Refresh checkout and try again.' }, { status: 400 })
  if (requiredFields.some((field) => typeof customer[field] !== 'string' || !String(customer[field]).trim() || String(customer[field]).length > 240)) return NextResponse.json({ error: 'Please complete all delivery details.' }, { status: 400 })
  const email = String(customer.email).trim().toLowerCase()
  const phone = String(customer.phone).replace(/\D/g, '').slice(-10)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[6-9]\d{9}$/.test(phone) || !/^\d{6}$/.test(String(customer.postal).trim())) return NextResponse.json({ error: 'Enter a valid email, 10-digit Indian mobile number and 6-digit PIN code.' }, { status: 400 })

  // Re-check current product availability and configured stock from the database;
  // browser cart data is only a convenience snapshot and is not trusted.
  const catalogService = getSupabaseServiceClient()
  const requestedProductIds = [...new Set(items.map((raw) => raw && typeof raw === 'object' ? String((raw as Record<string, unknown>).product_id ?? '') : '').filter(Boolean))]
  const { data: liveProducts, error: liveProductError } = await catalogService
    .from('products')
    .select('id,active,sizes,colors')
    .in('id', requestedProductIds)
  if (liveProductError) return NextResponse.json({ error: 'We could not verify product availability. Please try again.' }, { status: 503 })
  const liveProductMap = new Map((liveProducts ?? []).map((product) => [product.id, product]))
  const { data: liveStock, error: liveStockError } = await catalogService
    .from('product_inventory')
    .select('product_id,size,color,stock_on_hand')
    .in('product_id', requestedProductIds)
  if (liveStockError && liveStockError.code !== '42P01') return NextResponse.json({ error: 'We could not verify stock. Please try again.' }, { status: 503 })
  const stockMap = new Map((liveStock ?? []).map((row) => [`${row.product_id}:${row.size}:${row.color}`, Number(row.stock_on_hand)]))
  const normalized = new Map<string, { product_id: string; size: string; color: string; quantity: number }>()
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') return NextResponse.json({ error: 'Invalid item in your bag.' }, { status: 400 })
    const line = raw as Record<string, unknown>
    const product_id = typeof line.product_id === 'string' ? line.product_id : ''
    const size = typeof line.size === 'string' ? line.size.slice(0, 40) : ''
    const color = typeof line.color === 'string' ? line.color.slice(0, 40) : ''
    const quantity = Number(line.quantity)
    if (!product_id || !size || !color || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) return NextResponse.json({ error: 'A product option or quantity is invalid.' }, { status: 400 })
    const liveProduct = liveProductMap.get(product_id)
    if (!liveProduct?.active) return NextResponse.json({ error: 'One of the products is no longer available.' }, { status: 409 })
    if ((Array.isArray(liveProduct.sizes) && liveProduct.sizes.length && !liveProduct.sizes.includes(size)) || (Array.isArray(liveProduct.colors) && liveProduct.colors.length && !liveProduct.colors.includes(color))) return NextResponse.json({ error: 'A selected product variant is no longer available.' }, { status: 409 })
    const available = stockMap.get(`${product_id}:${size}:${color}`)
    if (available !== undefined && quantity > available) return NextResponse.json({ error: 'The requested quantity is no longer in stock.' }, { status: 409 })
    const key = `${product_id}:${size}:${color}`
    const next = (normalized.get(key)?.quantity ?? 0) + quantity
    if (next > 10) return NextResponse.json({ error: 'Maximum 10 of each product option per order.' }, { status: 400 })
    normalized.set(key, { product_id, size, color, quantity: next })
  }

  const account = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization } } })
  const { data: authData, error: authError } = await account.auth.getUser(authorization.slice(7))
  if (authError || !authData.user) return NextResponse.json({ error: 'Please sign in again before placing the order.' }, { status: 401 })
  if (!authData.user.email_confirmed_at || email !== authData.user.email?.toLowerCase()) return NextResponse.json({ error: 'Use your confirmed account email before placing an order.' }, { status: 403 })

  const { error: profileError } = await account.from('customer_profiles').update({
    full_name: String(customer.name).trim(), phone, address: String(customer.address).trim(),
    city: String(customer.city).trim(), state: String(customer.state).trim(),
    postal_code: String(customer.postal).trim(), updated_at: new Date().toISOString(),
  }).eq('user_id', authData.user.id)
  if (profileError) return NextResponse.json({ error: 'Please complete your saved profile details before placing the order.' }, { status: 400 })

  try {
    const service = getSupabaseServiceClient()
    const { data: order, error: orderError } = await service.rpc('create_account_order', {
      p_user_id: authData.user.id, p_items: [...normalized.values()],
      p_payment_method: paymentMethod, p_idempotency_key: idempotencyKey,
    })
    if (orderError || !order) {
      console.error('[orders] Order creation failed:', orderError?.message ?? 'No order returned')
      if (orderError?.message?.includes('UPI transaction limit')) return NextResponse.json({ error: 'Online payments are limited to ₹100,000 per order. Choose COD or reduce the order total.' }, { status: 400 })
      return NextResponse.json({ error: orderError?.message?.toLowerCase().includes('stock') ? 'One of the items is no longer available in that quantity.' : 'We could not save your order. Please try again in a moment.' }, { status: 503 })
    }
    if (paymentMethod === 'cod') return NextResponse.json({ orderNumber: order.order_number, total: Number(order.total), currency: 'INR', paymentMethod: 'cod' }, { status: 201 })

    const { data: attempts, error: attemptError } = await service.rpc('begin_account_payment', {
      p_user_id: authData.user.id, p_order_id: order.order_id, p_request_id: idempotencyKey,
    })
    if (attemptError || !attempts?.[0]) throw new Error(attemptError?.message ?? 'Could not start payment attempt')
    let attempt = attempts[0]
    let razorpayOrder: RazorpayOrder
    if (attempt.razorpay_order_id) {
      razorpayOrder = await razorpayRequest<RazorpayOrder>(`orders/${attempt.razorpay_order_id}`)
      if (razorpayOrder.status === 'paid') return NextResponse.json({ error: 'This payment is already completed. Check your order history.' }, { status: 409 })
    } else {
      const { keyId } = getRazorpayCredentials()
      razorpayOrder = await razorpayRequest<RazorpayOrder>('orders', {
        method: 'POST',
        body: JSON.stringify({
          amount: Math.round(Number(order.total) * 100), currency: 'INR',
          receipt: String(order.order_number).slice(0, 40),
          notes: { order_id: order.order_id, user_id: authData.user.id, attempt_id: attempt.attempt_id },
        }),
      })
      const { error: attachError } = await service.rpc('attach_account_payment_session', {
        p_user_id: authData.user.id, p_order_id: order.order_id,
        p_attempt_id: attempt.attempt_id, p_session_id: razorpayOrder.id,
      })
      if (attachError) throw new Error(attachError.message)
      return NextResponse.json({
        keyId, razorpayOrderId: razorpayOrder.id, amount: razorpayOrder.amount,
        currency: razorpayOrder.currency, orderNumber: order.order_number,
        customer: { name: String(customer.name), email, phone },
      }, { status: 201 })
    }
    const { keyId } = getRazorpayCredentials()
    return NextResponse.json({
      keyId, razorpayOrderId: razorpayOrder.id, amount: razorpayOrder.amount,
      currency: razorpayOrder.currency, orderNumber: order.order_number,
      customer: { name: String(customer.name), email, phone },
    }, { status: 200 })
  } catch (cause) {
    console.error('[orders] Razorpay checkout failed:', cause instanceof Error ? cause.message : 'Unknown error')
    return NextResponse.json({ error: cause instanceof Error && cause.message.includes('Razorpay is not configured') ? cause.message : 'Secure payment checkout could not be started. Please try again shortly.' }, { status: 503 })
  }
}
