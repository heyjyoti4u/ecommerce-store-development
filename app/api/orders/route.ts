import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripeServerClient, getSupabaseAnonKey, getSupabaseServiceClient } from '@/lib/stripe-server'

export const runtime = 'nodejs'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const requiredFields = ['name', 'email', 'phone', 'address', 'city', 'state', 'postal'] as const

function deterministicRetryKey(idempotencyKey: string, expiredSessionId: string) {
  const hex = createHash('sha256').update(`${idempotencyKey}:${expiredSessionId}`).digest('hex').slice(0, 32).split('')
  hex[12] = '5'
  hex[16] = ((Number.parseInt(hex[16], 16) & 3) | 8).toString(16)
  const value = hex.join('')
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) return NextResponse.json({ error: 'Invalid checkout origin.' }, { status: 403 })
    } catch {
      return NextResponse.json({ error: 'Invalid checkout origin.' }, { status: 403 })
    }
  }
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > 64 * 1024) return NextResponse.json({ error: 'Checkout request is too large.' }, { status: 413 })

  const url = process.env.ECOMMERCE_STORE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_ECOMMERCE_STORE_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = getSupabaseAnonKey()
  const authorization = request.headers.get('authorization')
  if (!url || !anonKey) return NextResponse.json({ error: 'Supabase is not configured for checkout.' }, { status: 503 })
  if (!authorization?.startsWith('Bearer ')) return NextResponse.json({ error: 'Sign in and confirm your email and mobile number before placing an order.' }, { status: 401 })

  let payload: unknown
  try { payload = await request.json() } catch { return NextResponse.json({ error: 'Please check your checkout details and try again.' }, { status: 400 }) }
  if (!payload || typeof payload !== 'object') return NextResponse.json({ error: 'Invalid checkout details.' }, { status: 400 })
  const body = payload as Record<string, unknown>
  const customer = body.customer as Record<string, unknown> | undefined
  const items = body.items
  const paymentMethod = body.paymentMethod
  const idempotencyKey = body.idempotencyKey
  if (!customer || !Array.isArray(items) || items.length < 1 || items.length > 30) return NextResponse.json({ error: 'Your bag is empty or has too many items.' }, { status: 400 })
  if (paymentMethod !== 'cod' && paymentMethod !== 'upi') return NextResponse.json({ error: 'Choose a supported payment method.' }, { status: 400 })
  if (typeof idempotencyKey !== 'string' || !uuidPattern.test(idempotencyKey)) return NextResponse.json({ error: 'Refresh checkout and try again.' }, { status: 400 })
  if (requiredFields.some((field) => typeof customer[field] !== 'string' || !String(customer[field]).trim() || String(customer[field]).length > 240)) return NextResponse.json({ error: 'Please complete all delivery details.' }, { status: 400 })
  const submittedEmail = String(customer.email).trim().toLowerCase()
  const submittedPhone = String(customer.phone).replace(/\D/g, '').slice(-10)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submittedEmail) || !/^[6-9]\d{9}$/.test(submittedPhone) || !/^\d{6}$/.test(String(customer.postal).trim())) return NextResponse.json({ error: 'Enter a valid email, 10-digit Indian mobile number and 6-digit PIN code.' }, { status: 400 })

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

  const accountClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  })
  const { data: authData, error: authError } = await accountClient.auth.getUser(authorization.slice(7))
  if (authError || !authData.user) return NextResponse.json({ error: 'Please sign in again before placing your order.' }, { status: 401 })
  if (!authData.user.email_confirmed_at || submittedEmail !== authData.user.email?.toLowerCase()) return NextResponse.json({ error: 'Use your confirmed account email before placing an order.' }, { status: 403 })
  const verifiedPhone = String(authData.user.phone ?? '').replace(/\D/g, '').slice(-10)
  if (!authData.user.phone_confirmed_at || !verifiedPhone || verifiedPhone !== submittedPhone) return NextResponse.json({ error: 'Confirm the mobile number on your account before placing an order.' }, { status: 403 })

  const { error: profileError } = await accountClient.from('customer_profiles').update({
    full_name: String(customer.name).trim(),
    phone: submittedPhone,
    address: String(customer.address).trim(),
    city: String(customer.city).trim(),
    state: String(customer.state).trim(),
    postal_code: String(customer.postal).trim(),
    updated_at: new Date().toISOString(),
  }).eq('user_id', authData.user.id)
  if (profileError) return NextResponse.json({ error: 'Please complete your saved profile details before placing the order.' }, { status: 400 })

  try {
    const service = getSupabaseServiceClient()
    const { data: order, error: orderError } = await service.rpc('create_account_order', {
      p_user_id: authData.user.id,
      p_items: [...normalized.values()],
      p_payment_method: paymentMethod,
      p_idempotency_key: idempotencyKey,
    })
    if (orderError || !order) {
      console.error('[orders] Order creation failed:', orderError?.message ?? 'No order returned')
      if (orderError?.message?.includes('UPI transaction limit')) return NextResponse.json({ error: 'UPI payments are limited to ₹100,000 per order. Choose cash on delivery or reduce the order total.' }, { status: 400 })
      return NextResponse.json({ error: orderError?.message?.toLowerCase().includes('stock') ? 'One of the items is no longer available in that quantity.' : 'We could not save your order. Please try again in a moment.' }, { status: 503 })
    }
    if (paymentMethod === 'cod') return NextResponse.json({ orderNumber: order.order_number, total: Number(order.total), currency: 'INR', paymentMethod: 'cod' }, { status: 201 })

    const { data: attempts, error: attemptError } = await service.rpc('begin_account_payment', {
      p_user_id: authData.user.id,
      p_order_id: order.order_id,
      p_request_id: idempotencyKey,
    })
    if (attemptError || !attempts?.[0]) {
      console.error('[checkout] Payment attempt could not be started:', attemptError?.message ?? 'No payment attempt returned')
      return NextResponse.json({ error: 'We could not start UPI checkout. Please try again.' }, { status: 503 })
    }
    let attempt = attempts[0]
    const stripe = getStripeServerClient()
    if (attempt.stripe_session_id) {
      const existingSession = await stripe.checkout.sessions.retrieve(attempt.stripe_session_id)
      if (existingSession.status === 'open' && existingSession.url) return NextResponse.json({ checkoutUrl: existingSession.url }, { status: 200 })
      if (existingSession.status === 'complete') return NextResponse.json({ error: 'This payment is already processing. Check your order history in a moment.' }, { status: 409 })
      const retryRequestId = deterministicRetryKey(idempotencyKey, existingSession.id)
      const { data: retryAttempts, error: retryError } = await service.rpc('begin_account_payment', {
        p_user_id: authData.user.id,
        p_order_id: order.order_id,
        p_request_id: retryRequestId,
      })
      if (retryError || !retryAttempts?.[0]) return NextResponse.json({ error: 'We could not restart the expired UPI session.' }, { status: 503 })
      attempt = retryAttempts[0]
    }

    const { data: orderItems, error: orderItemsError } = await service.from('order_items')
      .select('product_name,unit_price,size,color,quantity')
      .eq('order_id', order.order_id)
    if (orderItemsError || !orderItems?.length) return NextResponse.json({ error: 'We could not load the saved order items for payment.' }, { status: 503 })
    const lineItems = orderItems.map((item) => ({
      quantity: item.quantity,
      price_data: {
        currency: 'inr',
        unit_amount: Math.round(Number(item.unit_price) * 100),
        product_data: { name: `${item.product_name} · ${item.color} / ${item.size}` },
      },
    }))
    const subtotal = orderItems.reduce((sum, item) => sum + Number(item.unit_price) * item.quantity, 0)
    const shipping = Number(order.total) - subtotal
    if (shipping < 0 || (shipping !== 0 && shipping !== 150)) return NextResponse.json({ error: 'Saved order total could not be reconciled for payment.' }, { status: 409 })
    if (shipping > 0) lineItems.push({ quantity: 1, price_data: { currency: 'inr', unit_amount: Math.round(shipping * 100), product_data: { name: 'Standard delivery' } } })
    const appOrigin = new URL(request.url).origin
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      allowed_payment_method_types: ['upi'],
      line_items: lineItems,
      customer_email: authData.user.email ?? submittedEmail,
      client_reference_id: order.order_number,
      metadata: { order_id: order.order_id, user_id: authData.user.id, attempt_id: attempt.attempt_id },
      success_url: `${appOrigin}/order-confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appOrigin}/checkout?payment=cancelled&order=${encodeURIComponent(order.order_id)}`,
    }, { idempotencyKey: `oro-upi-${attempt.attempt_id}` })
    if (!session.url) return NextResponse.json({ error: 'Stripe did not return a checkout link. Please try again.' }, { status: 503 })
    const { error: attachError } = await service.rpc('attach_account_payment_session', {
      p_user_id: authData.user.id,
      p_order_id: order.order_id,
      p_attempt_id: attempt.attempt_id,
      p_session_id: session.id,
    })
    if (attachError) {
      console.error('[checkout] Could not attach Stripe session:', attachError.message)
      return NextResponse.json({ error: 'Your secure payment session started, but could not be linked to the order. Retry checkout to continue.' }, { status: 503 })
    }
    return NextResponse.json({ checkoutUrl: session.url }, { status: 201 })
  } catch (cause) {
    console.error('[orders] Secure checkout failed:', cause instanceof Error ? cause.message : 'Unknown error')
    return NextResponse.json({ error: cause instanceof Error && cause.message.includes('Stripe is not configured') ? cause.message : 'Checkout could not be completed. Please try again shortly.' }, { status: 503 })
  }
}
