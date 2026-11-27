import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { razorpayRequest, getSupabaseServiceClient } from '@/lib/razorpay-server'

export const runtime = 'nodejs'

type RazorpayWebhook = {
  event?: string
  payload?: { payment?: { entity?: { id?: string; order_id?: string; status?: string } } }
}

export async function POST(request: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'Webhook is not configured.' }, { status: 503 })
  const signature = request.headers.get('x-razorpay-signature') ?? ''
  const rawBody = await request.text()
  const expected = createHmac('sha256', secret).update(rawBody).digest()
  let received: Buffer
  try { received = Buffer.from(signature, 'hex') } catch { return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 400 }) }
  if (!signature || received.length !== expected.length || !timingSafeEqual(expected, received)) {
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 400 })
  }

  try {
    const event = JSON.parse(rawBody) as RazorpayWebhook
    if (!['payment.captured', 'order.paid'].includes(event.event ?? '')) return NextResponse.json({ received: true })
    const paymentId = event.payload?.payment?.entity?.id
    const orderId = event.payload?.payment?.entity?.order_id
    if (!paymentId || !orderId) return NextResponse.json({ received: true })
    const payment = await razorpayRequest<{ id: string; order_id: string; status: string; amount: number; currency: string }>(`payments/${paymentId}`)
    if (payment.status !== 'captured' || payment.order_id !== orderId) return NextResponse.json({ received: true })

    const service = getSupabaseServiceClient()
    const { data: attempt } = await service.from('order_payment_attempts')
      .select('id,order_id').eq('razorpay_order_id', orderId).maybeSingle()
    if (!attempt) return NextResponse.json({ received: true })
    const { data: order } = await service.from('orders').select('customer_id,total,razorpay_order_id').eq('id', attempt.order_id).maybeSingle()
    if (!order || order.razorpay_order_id !== orderId || payment.currency !== 'INR' || payment.amount !== Math.round(Number(order.total) * 100)) return NextResponse.json({ received: true })
    const { data: profile } = await service.from('customer_profiles').select('user_id').eq('id', order.customer_id).maybeSingle()
    if (!profile?.user_id) return NextResponse.json({ received: true })
    const { error } = await service.rpc('confirm_account_payment', {
      p_user_id: profile.user_id, p_order_id: attempt.order_id, p_attempt_id: attempt.id,
      p_session_id: orderId, p_payment_intent_id: paymentId,
    })
    if (error) throw error
    return NextResponse.json({ received: true })
  } catch (cause) {
    console.error('[razorpay webhook] Processing failed:', cause instanceof Error ? cause.message : 'Unknown error')
    return NextResponse.json({ error: 'Webhook processing failed.' }, { status: 500 })
  }
}
