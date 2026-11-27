import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripeServerClient, getSupabaseAnonKey, getSupabaseServiceClient } from '@/lib/stripe-server'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return NextResponse.json({ error: 'Sign in to verify this payment.' }, { status: 401 })

  let sessionId = ''
  try {
    const body = await request.json() as { sessionId?: unknown }
    sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
  } catch {
    return NextResponse.json({ error: 'Invalid payment confirmation request.' }, { status: 400 })
  }
  if (!sessionId.startsWith('cs_') || sessionId.length > 255) return NextResponse.json({ error: 'Invalid Stripe checkout session.' }, { status: 400 })

  const anonKey = getSupabaseAnonKey()
  if (!anonKey) return NextResponse.json({ error: 'Supabase authentication is not configured.' }, { status: 503 })
  const url = process.env.ECOMMERCE_STORE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_ECOMMERCE_STORE_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 })
  const accountClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization } } })
  const { data: authData, error: authError } = await accountClient.auth.getUser(authorization.slice(7))
  if (authError || !authData.user || !authData.user.email_confirmed_at) return NextResponse.json({ error: 'Please sign in again to verify this payment.' }, { status: 401 })

  try {
    const stripe = getStripeServerClient()
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    if (session.metadata?.user_id !== authData.user.id || !session.metadata?.order_id || !session.metadata?.attempt_id) {
      return NextResponse.json({ error: 'This payment does not belong to your account.' }, { status: 403 })
    }
    if (session.payment_status !== 'paid') {
      return NextResponse.json({ state: 'pending', message: 'Your UPI payment is still processing. This page will update once Stripe confirms it.' }, { status: 202 })
    }
    const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? ''
    if (!paymentIntentId) return NextResponse.json({ error: 'Stripe did not return a verified payment reference.' }, { status: 409 })

    const service = getSupabaseServiceClient()
    const { data, error } = await service.rpc('confirm_account_payment', {
      p_user_id: authData.user.id,
      p_order_id: session.metadata.order_id,
      p_attempt_id: session.metadata.attempt_id,
      p_session_id: session.id,
      p_payment_intent_id: paymentIntentId,
    })
    if (error || !data) {
      console.error('[checkout] Payment confirmation RPC failed:', error?.message ?? 'No order returned')
      return NextResponse.json({ error: 'We verified your payment, but could not update the order. Please contact support with your Stripe receipt.' }, { status: 503 })
    }
    return NextResponse.json({ state: 'paid', orderNumber: data.order_number, total: Number(data.total), currency: data.currency ?? 'INR' })
  } catch (cause) {
    console.error('[checkout] Stripe payment verification failed:', cause instanceof Error ? cause.message : 'Unknown error')
    return NextResponse.json({ error: 'Could not verify your payment yet. Please refresh in a moment.' }, { status: 503 })
  }
}
