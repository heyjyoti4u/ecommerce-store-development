import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { razorpayRequest, getSupabaseAnonKey, getSupabaseServiceClient } from '@/lib/razorpay-server'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return NextResponse.json({ error: 'Sign in to verify this payment.' }, { status: 401 })
  let body: Record<string, unknown>
  try { body = await request.json() as Record<string, unknown> } catch { return NextResponse.json({ error: 'Invalid payment confirmation.' }, { status: 400 }) }
  const razorpay_order_id = typeof body.razorpay_order_id === 'string' ? body.razorpay_order_id : ''
  const razorpay_payment_id = typeof body.razorpay_payment_id === 'string' ? body.razorpay_payment_id : ''
  const razorpay_signature = typeof body.razorpay_signature === 'string' ? body.razorpay_signature : ''
  if (!/^order_[A-Za-z0-9]+$/.test(razorpay_order_id) || !/^pay_[A-Za-z0-9]+$/.test(razorpay_payment_id) || !/^[a-f0-9]{64}$/i.test(razorpay_signature)) {
    return NextResponse.json({ error: 'Invalid Razorpay payment reference.' }, { status: 400 })
  }

  const url = process.env.ECOMMERCE_STORE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_ECOMMERCE_STORE_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = getSupabaseAnonKey()
  if (!url || !anonKey) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 })
  const account = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization } } })
  const { data: authData, error: authError } = await account.auth.getUser(authorization.slice(7))
  if (authError || !authData.user || !authData.user.email_confirmed_at) return NextResponse.json({ error: 'Please sign in again to verify this payment.' }, { status: 401 })

  try {
    const service = getSupabaseServiceClient()
    const { data: attempt, error: attemptError } = await service.from('order_payment_attempts')
      .select('id,order_id,razorpay_order_id').eq('razorpay_order_id', razorpay_order_id).maybeSingle()
    if (attemptError || !attempt || attempt.razorpay_order_id !== razorpay_order_id) return NextResponse.json({ error: 'Payment attempt was not found.' }, { status: 404 })
    const { data: order, error: orderError } = await service.from('orders')
      .select('id,order_number,total,customer_id,payment_status,razorpay_order_id')
      .eq('id', attempt.order_id).maybeSingle()
    if (orderError || !order || order.razorpay_order_id !== razorpay_order_id) return NextResponse.json({ error: 'Order was not found.' }, { status: 404 })
    const { data: profile } = await service.from('customer_profiles').select('id').eq('user_id', authData.user.id).maybeSingle()
    if (!profile || profile.id !== order.customer_id) return NextResponse.json({ error: 'This payment does not belong to your account.' }, { status: 403 })

    // Verify against the Razorpay order ID stored by our server, not a client-supplied value.
    const secret = process.env.RAZORPAY_KEY_SECRET
    if (!secret) throw new Error('Razorpay is not configured.')
    const expected = createHmac('sha256', secret).update(`${order.razorpay_order_id}|${razorpay_payment_id}`).digest()
    const received = Buffer.from(razorpay_signature, 'hex')
    if (received.length !== expected.length || !timingSafeEqual(expected, received)) return NextResponse.json({ error: 'Payment signature could not be verified.' }, { status: 400 })

    const payment = await razorpayRequest<{ id: string; order_id: string; amount: number; currency: string; status: string }>(`payments/${razorpay_payment_id}`)
    if (payment.order_id !== order.razorpay_order_id || payment.currency !== 'INR') return NextResponse.json({ error: 'Payment does not match this order.' }, { status: 409 })
    if (payment.status !== 'captured') return NextResponse.json({ state: 'pending', message: 'Your payment is not captured yet. Please check again shortly.' }, { status: 202 })
    if (payment.amount !== Math.round(Number(order.total) * 100)) return NextResponse.json({ error: 'Payment amount does not match the order total.' }, { status: 409 })

    const { data, error } = await service.rpc('confirm_account_payment', {
      p_user_id: authData.user.id, p_order_id: order.id, p_attempt_id: attempt.id,
      p_session_id: razorpay_order_id, p_payment_intent_id: razorpay_payment_id,
    })
    if (error || !data) {
      console.error('[checkout] Razorpay confirmation failed:', error?.message ?? 'No order returned')
      return NextResponse.json({ error: 'Payment is verified, but the order update failed. Please contact support with payment ID ' + razorpay_payment_id }, { status: 503 })
    }
    return NextResponse.json({ state: 'paid', orderNumber: data.order_number, total: Number(data.total), currency: 'INR' })
  } catch (cause) {
    console.error('[checkout] Razorpay verification failed:', cause instanceof Error ? cause.message : 'Unknown error')
    return NextResponse.json({ error: cause instanceof Error ? cause.message : 'Could not verify payment.' }, { status: 503 })
  }
}
