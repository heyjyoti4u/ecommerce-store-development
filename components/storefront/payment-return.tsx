'use client'

import Link from 'next/link'
import { useState } from 'react'
import { CheckCircle2, Clock3 } from 'lucide-react'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useCart } from '@/components/storefront/cart-store'
import { formatPrice } from '@/lib/store-products'

type Confirmation = { state: 'pending' | 'paid' | 'error'; message?: string; orderNumber?: string; total?: number }

export default function PaymentReturn({ sessionId }: { sessionId: string }) {
  const { clear } = useCart()
  const [result, setResult] = useState<Confirmation>({ state: 'pending', message: 'Select the button below to verify your UPI payment securely.' })
  const [checking, setChecking] = useState(false)

  async function verifyPayment() {
    setChecking(true)
    try {
      const { data: { session } } = await getSupabaseBrowserClient().auth.getSession()
      if (!session?.access_token) throw new Error('Sign in to your ORO account to verify this order.')
      const response = await fetch('/api/checkout/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ sessionId }),
      })
      const data = await response.json()
      if (response.status === 202) {
        setResult({ state: 'pending', message: data.message ?? 'Your payment is still processing. Check again shortly.' })
      } else if (!response.ok) {
        throw new Error(data.error ?? 'We could not verify your payment yet.')
      } else {
        clear()
        setResult({ state: 'paid', orderNumber: data.orderNumber, total: Number(data.total) })
      }
    } catch (cause) {
      setResult({ state: 'error', message: cause instanceof Error ? cause.message : 'Payment verification failed.' })
    } finally {
      setChecking(false)
    }
  }


  return <main className="store-page confirmation-page">
    {result.state === 'paid' ? <><CheckCircle2 className="confirmation-check-icon" size={38} aria-hidden="true" /><span className="section-kicker">Payment received</span><h1>Your order is confirmed.</h1><p>Order {result.orderNumber} is confirmed and your UPI payment has been received.</p>{Number.isFinite(result.total) && <p className="confirmation-total">Order total · {formatPrice(result.total ?? 0)} · Paid by UPI</p>}<Link href="/account" className="button-dark">View your order</Link></> : <><Clock3 className="confirmation-check-icon" size={34} aria-hidden="true" /><span className="section-kicker">Secure payment status</span><h1>{result.state === 'error' ? 'Payment status unavailable.' : 'Confirm your payment.'}</h1><p role={result.state === 'error' ? 'alert' : 'status'}>{result.message}</p><button className="button-dark" type="button" disabled={checking} onClick={() => void verifyPayment()}>{checking ? 'Checking…' : 'Check payment status'}</button><Link href="/account" className="text-link">Go to your account</Link></>}
  </main>
}
