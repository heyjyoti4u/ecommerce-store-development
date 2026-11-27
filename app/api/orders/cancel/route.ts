import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripeServerClient, getSupabaseAnonKey, getSupabaseServiceClient } from '@/lib/stripe-server'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return NextResponse.json({ error: 'Sign in to cancel an order.' }, { status: 401 })

  let orderId = ''
  let reason = 'Customer requested cancellation'
  try {
    const body = await request.json() as { orderId?: unknown; reason?: unknown }
    orderId = typeof body.orderId === 'string' ? body.orderId : ''
    reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : reason
  } catch {
    return NextResponse.json({ error: 'Invalid cancellation request.' }, { status: 400 })
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) return NextResponse.json({ error: 'Invalid order reference.' }, { status: 400 })

  const url = process.env.ECOMMERCE_STORE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_ECOMMERCE_STORE_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = getSupabaseAnonKey()
  if (!url || !anonKey) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 })
  const accountClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization } } })
  const { data: authData, error: authError } = await accountClient.auth.getUser(authorization.slice(7))
  if (authError || !authData.user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })

  try {
    const service = getSupabaseServiceClient()
    const { data: profile } = await service.from('customer_profiles').select('id').eq('user_id', authData.user.id).maybeSingle()
    if (!profile) return NextResponse.json({ error: 'Customer profile not found.' }, { status: 404 })
    const { data: foundOrder, error: orderError } = await service.from('orders')
      .select('id,order_number,status,payment_status,payment_method,stripe_payment_intent_id,stripe_checkout_session_id,refund_id')
      .eq('id', orderId).eq('customer_id', profile.id).maybeSingle()
    if (orderError || !foundOrder) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
    let order = foundOrder
    if (order.status === 'cancelled') {
      let paymentStatus = order.payment_status
      if (paymentStatus === 'refund_pending' && order.refund_id) {
        const refund = await getStripeServerClient().refunds.retrieve(order.refund_id)
        if (refund.status === 'succeeded') {
          const { error: syncError } = await service.from('orders').update({ payment_status: 'refunded' }).eq('id', order.id).eq('payment_status', 'refund_pending')
          if (syncError) throw syncError
          paymentStatus = 'refunded'
        }
      }
      return NextResponse.json({ orderNumber: order.order_number, status: 'cancelled', paymentStatus })
    }
    if (!['pending_payment', 'confirmed', 'processing'].includes(order.status)) return NextResponse.json({ error: 'This order can no longer be cancelled online.' }, { status: 409 })

    if (order.status === 'pending_payment' && order.stripe_checkout_session_id) {
      const stripe = getStripeServerClient()
      let session = await stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id)
      if (session.payment_status === 'paid') {
        if (session.metadata?.user_id !== authData.user.id || session.metadata.order_id !== order.id || !session.metadata.attempt_id) {
          return NextResponse.json({ error: 'We could not verify the payment attached to this order.' }, { status: 409 })
        }
        const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? ''
        if (!paymentIntentId) return NextResponse.json({ error: 'The paid session is missing its Stripe payment reference.' }, { status: 409 })
        const { error: confirmError } = await service.rpc('confirm_account_payment', {
          p_user_id: authData.user.id,
          p_order_id: order.id,
          p_attempt_id: session.metadata.attempt_id,
          p_session_id: session.id,
          p_payment_intent_id: paymentIntentId,
        })
        if (confirmError) throw confirmError
        const { data: refreshedOrder, error: refreshError } = await service.from('orders')
          .select('id,order_number,status,payment_status,payment_method,stripe_payment_intent_id,stripe_checkout_session_id,refund_id')
          .eq('id', order.id).maybeSingle()
        if (refreshError || !refreshedOrder) throw refreshError ?? new Error('Order could not be refreshed')
        order = refreshedOrder
      } else if (session.status === 'open') {
        try {
          session = await stripe.checkout.sessions.expire(session.id)
        } catch {
          session = await stripe.checkout.sessions.retrieve(session.id)
        }
        if (session.payment_status === 'paid') return NextResponse.json({ error: 'Payment completed while cancelling. Refresh your order and try again.' }, { status: 409 })
        if (session.status !== 'expired') return NextResponse.json({ error: 'Payment is still processing. Check its status before cancelling.' }, { status: 409 })
      } else if (session.status === 'complete') {
        return NextResponse.json({ error: 'Payment is still processing. Check its status before cancelling.' }, { status: 409 })
      }
    }

    let refundId: string | null = null
    let refundStatus: string | null = null
    if (order.payment_status === 'paid') {
      if (!order.stripe_payment_intent_id) return NextResponse.json({ error: 'The payment reference is missing. Please contact support before cancelling.' }, { status: 409 })
      const refund = await getStripeServerClient().refunds.create({
        payment_intent: order.stripe_payment_intent_id,
        reason: 'requested_by_customer',
        metadata: { order_id: order.id, order_number: order.order_number },
      }, { idempotencyKey: `oro-order-refund-${order.id}` })
      if (refund.status !== 'succeeded' && refund.status !== 'pending') return NextResponse.json({ error: 'Stripe has not confirmed the refund. The order was not cancelled.' }, { status: 502 })
      refundId = refund.id
      refundStatus = refund.status
    }

    const { data, error } = await service.rpc('cancel_account_order', {
      p_user_id: authData.user.id,
      p_order_id: order.id,
      p_reason: reason,
      p_refund_id: refundId,
      p_refund_status: refundStatus,
    })
    if (error || !data) {
      console.error('[orders] Cancellation update failed:', error?.message ?? 'No order returned')
      return NextResponse.json({ error: refundId ? 'The refund was submitted, but order cancellation needs a retry. Please contact support if it remains unchanged.' : 'We could not cancel the order. Please try again.' }, { status: 503 })
    }
    return NextResponse.json({ orderNumber: data.order_number, status: data.status, paymentStatus: data.payment_status })
  } catch (cause) {
    console.error('[orders] Cancellation failed:', cause instanceof Error ? cause.message : 'Unknown error')
    return NextResponse.json({ error: 'We could not process the cancellation right now. Please try again shortly.' }, { status: 503 })
  }
}
