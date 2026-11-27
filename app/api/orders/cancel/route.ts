import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { razorpayRequest, getSupabaseAnonKey, getSupabaseServiceClient } from '@/lib/razorpay-server'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return NextResponse.json({ error: 'Sign in to cancel an order.' }, { status: 401 })
  let body: { orderId?: unknown; reason?: unknown }
  try { body = await request.json() as { orderId?: unknown; reason?: unknown } }
  catch { return NextResponse.json({ error: 'Invalid cancellation request.' }, { status: 400 }) }
  const orderId = typeof body.orderId === 'string' ? body.orderId : ''
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : 'Customer requested cancellation'
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) return NextResponse.json({ error: 'Invalid order reference.' }, { status: 400 })

  const url = process.env.ECOMMERCE_STORE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_ECOMMERCE_STORE_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = getSupabaseAnonKey()
  if (!url || !anonKey) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 })
  const account = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization } } })
  const { data: authData, error: authError } = await account.auth.getUser(authorization.slice(7))
  if (authError || !authData.user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })

  try {
    const service = getSupabaseServiceClient()
    const { data: profile } = await service.from('customer_profiles').select('id').eq('user_id', authData.user.id).maybeSingle()
    if (!profile) return NextResponse.json({ error: 'Customer profile not found.' }, { status: 404 })
    const { data: order, error: orderError } = await service.from('orders')
      .select('id,order_number,status,payment_status,payment_method,razorpay_order_id,razorpay_payment_id,refund_id,total')
      .eq('id', orderId).eq('customer_id', profile.id).maybeSingle()
    if (orderError || !order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
    if (order.status === 'cancelled') return NextResponse.json({ orderNumber: order.order_number, status: 'cancelled', paymentStatus: order.payment_status })
    if (!['pending_payment', 'confirmed', 'processing'].includes(order.status)) return NextResponse.json({ error: 'This order can no longer be cancelled online.' }, { status: 409 })

    let refundId: string | null = null
    let refundStatus: string | null = null
    let paymentId = order.razorpay_payment_id
    if (order.payment_method === 'upi' && order.razorpay_order_id && order.payment_status !== 'paid') {
      const payments = await razorpayRequest<{ items: Array<{ id: string; status: string; amount: number; currency: string }> }>(`orders/${order.razorpay_order_id}/payments`)
      const captured = payments.items?.find((payment) => payment.status === 'captured')
      if (captured) {
        if (captured.currency !== 'INR' || captured.amount !== Math.round(Number(order.total) * 100)) {
          return NextResponse.json({ error: 'The captured payment does not match this order. Please contact support.' }, { status: 409 })
        }
        const { data: attempt } = await service.from('order_payment_attempts').select('id')
          .eq('razorpay_order_id', order.razorpay_order_id).maybeSingle()
        if (!attempt) return NextResponse.json({ error: 'Payment reference is missing. Please contact support.' }, { status: 409 })
        const { error: confirmError } = await service.rpc('confirm_account_payment', {
          p_user_id: authData.user.id, p_order_id: order.id, p_attempt_id: attempt.id,
          p_session_id: order.razorpay_order_id, p_payment_intent_id: captured.id,
        })
        if (confirmError) throw confirmError
        paymentId = captured.id
        order.payment_status = 'paid'
        order.razorpay_payment_id = captured.id
      } else if (payments.items?.some((payment) => payment.status === 'authorized')) {
        return NextResponse.json({ error: 'Payment is authorised but not yet captured. Please contact support before cancelling.' }, { status: 409 })
      }
    }
    if (order.payment_status === 'paid' || paymentId) {
      if (!paymentId) return NextResponse.json({ error: 'The payment reference is missing. Please contact support before cancelling.' }, { status: 409 })
      const refund = await razorpayRequest<{ id: string; status: string }>(`payments/${paymentId}/refund`, {
        method: 'POST',
        body: JSON.stringify({ notes: { order_id: order.id, order_number: order.order_number, reason } }),
      })
      if (!['processed', 'pending'].includes(refund.status)) return NextResponse.json({ error: 'Razorpay has not confirmed the refund. The order was not cancelled.' }, { status: 502 })
      refundId = refund.id
      refundStatus = refund.status === 'processed' ? 'succeeded' : 'pending'
    }

    const { data, error } = await service.rpc('cancel_account_order', {
      p_user_id: authData.user.id, p_order_id: order.id, p_reason: reason,
      p_refund_id: refundId, p_refund_status: refundStatus,
    })
    if (error || !data) {
      console.error('[orders] Cancellation update failed:', error?.message ?? 'No order returned')
      return NextResponse.json({ error: refundId ? 'The refund was submitted, but order cancellation needs a retry. Contact support with your order number.' : 'We could not cancel the order. Please try again.' }, { status: 503 })
    }
    return NextResponse.json({ orderNumber: data.order_number, status: data.status, paymentStatus: data.payment_status })
  } catch (cause) {
    console.error('[orders] Cancellation failed:', cause instanceof Error ? cause.message : 'Unknown error')
    return NextResponse.json({ error: 'We could not process the cancellation right now. Please try again shortly.' }, { status: 503 })
  }
}
