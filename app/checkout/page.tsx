'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import StoreHeader from '@/components/store-header'
import { useCart } from '@/components/storefront/cart-store'
import { formatPrice } from '@/lib/store-products'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, callback: (response: { error?: { description?: string } }) => void) => void }
  }
}

type CheckoutFields = { name: string; email: string; phone: string; address: string; city: string; state: string; postal: string }
type RazorpayCheckoutResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
const emptyForm: CheckoutFields = { name: '', email: '', phone: '', address: '', city: '', state: '', postal: '' }
const digitsOnly = (value: string) => value.replace(/\D/g, '').slice(-10)

export default function CheckoutPage() {
  const router = useRouter()
  const { items, subtotal, clear } = useCart()
  const [form, setForm] = useState(emptyForm)
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'upi'>('cod')
  const [cancelledOrderId, setCancelledOrderId] = useState('')
  const [releasingCancelledOrder, setReleasingCancelledOrder] = useState(false)
  const idempotencyKey = useRef<{ method: 'cod' | 'upi'; key: string } | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const supabase = getSupabaseBrowserClient()
        const { data: { user: currentUser } } = await supabase.auth.getUser()
        if (!active) return
        setUser(currentUser)
        const paymentWasCancelled = new URLSearchParams(window.location.search).get('payment') === 'cancelled'
        const cancelledOrder = new URLSearchParams(window.location.search).get('order')
        if (paymentWasCancelled) {
          setPaymentMethod('upi')
          setCancelledOrderId(cancelledOrder ?? '')
          setError('Your UPI payment was not completed. Your bag is still saved; release the pending order before retrying.')
        }
        if (!currentUser) return
        const { data } = await supabase.from('customer_profiles').select('full_name,phone,address,city,state,postal_code,email').eq('user_id', currentUser.id).maybeSingle()
        if (!active) return
        if (data) setForm({ name: data.full_name ?? '', email: currentUser.email ?? data.email ?? '', phone: data.phone ?? '', address: data.address ?? '', city: data.city ?? '', state: data.state ?? '', postal: data.postal_code ?? '' })
        else setForm((current) => ({ ...current, email: currentUser.email ?? '' }))
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load your account.')
      } finally {
        if (active) setAuthLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  const shipping = subtotal >= 3000 || subtotal === 0 ? 0 : 150

  async function releaseCancelledOrder() {
    if (!user || !cancelledOrderId || releasingCancelledOrder) return
    setReleasingCancelledOrder(true)
    try {
      const { data: { session } } = await getSupabaseBrowserClient().auth.getSession()
      if (!session?.access_token) throw new Error('Sign in again to release the pending order.')
      const response = await fetch('/api/orders/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ orderId: cancelledOrderId, reason: 'UPI checkout was cancelled' }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'Could not release the pending order.')
      setCancelledOrderId('')
      setError('Pending UPI order released. Your bag is saved; you can retry UPI or choose cash on delivery.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not release the pending order.')
    } finally {
      setReleasingCancelledOrder(false)
    }
  }

  async function placeOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!items.length || saving) return
    if (!user || !user.email_confirmed_at) { setError('Confirm your account email before placing the order.'); return }
    setError('')
    setSaving(true)
    try {
      const { data: { session } } = await getSupabaseBrowserClient().auth.getSession()
      if (!session?.access_token) throw new Error('Please sign in again before placing the order.')
      if (!idempotencyKey.current || idempotencyKey.current.method !== paymentMethod) {
        idempotencyKey.current = { method: paymentMethod, key: crypto.randomUUID() }
      }
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          customer: form,
          paymentMethod,
          idempotencyKey: idempotencyKey.current.key,
          items: items.map(({ product, size, color, quantity }) => ({ product_id: product.id, size, color, quantity })),
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'We could not save your order. Please try again.')
      if (paymentMethod === 'upi') {
        if (!result.keyId || !result.razorpayOrderId) throw new Error('Razorpay checkout is not configured. Please try COD or contact support.')
        const loadRazorpay = () => new Promise<void>((resolve, reject) => {
          if (window.Razorpay) return resolve()
          const existing = document.querySelector<HTMLScriptElement>('script[data-razorpay-checkout]')
          if (existing) {
            existing.addEventListener('load', () => resolve(), { once: true })
            existing.addEventListener('error', () => reject(new Error('Could not load Razorpay checkout.')), { once: true })
            return
          }
          const script = document.createElement('script')
          script.src = 'https://checkout.razorpay.com/v1/checkout.js'
          script.async = true
          script.dataset.razorpayCheckout = 'true'
          script.onload = () => resolve()
          script.onerror = () => reject(new Error('Could not load Razorpay checkout. Please check your connection.'))
          document.body.appendChild(script)
        })
        await loadRazorpay()
        if (!window.Razorpay) throw new Error('Razorpay checkout did not initialise.')
        const checkout = new window.Razorpay({
          key: result.keyId,
          order_id: result.razorpayOrderId,
          amount: result.amount,
          currency: 'INR',
          name: 'ORO',
          description: `Order ${result.orderNumber}`,
          prefill: { name: result.customer.name, email: result.customer.email, contact: result.customer.phone },
          notes: { order_number: result.orderNumber },
          theme: { color: '#24382f' },
          modal: { ondismiss: () => setError('Payment window closed. Your order is still pending; you can retry online payment or choose COD.') },
          handler: async (payment: RazorpayCheckoutResponse) => {
            try {
              const verify = await fetch('/api/checkout/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify(payment),
              })
              const verified = await verify.json()
              if (!verify.ok || verified.state !== 'paid') throw new Error(verified.error ?? verified.message ?? 'Payment verification is pending. Please check your order status.')
              idempotencyKey.current = null
              clear()
              router.push(`/order-confirmation?order=${encodeURIComponent(verified.orderNumber)}&total=${encodeURIComponent(String(verified.total))}&paid=1`)
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : 'Payment was received but could not yet be verified. Please do not pay again; contact support.')
            }
          },
        })
        checkout.on('payment.failed', (failure) => setError(failure.error?.description ?? 'Payment failed. You can retry or choose cash on delivery.'))
        checkout.open()
        return
      }
      idempotencyKey.current = null
      clear()
      router.push(`/order-confirmation?order=${encodeURIComponent(result.orderNumber)}&total=${encodeURIComponent(String(result.total))}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!items.length) return <><StoreHeader /><main className="store-page narrow-page"><div className="store-page-heading"><span className="section-kicker">Checkout</span><h1 className="section-title">Your bag is empty.</h1><Link className="button-dark" href="/products">Browse products</Link></div></main></>

  return <><StoreHeader /><main className="store-page narrow-page">
    <div className="store-breadcrumb"><Link href="/">Home</Link><span>/</span><Link href="/cart">Your bag</Link><span>/</span> Checkout</div>
    <div className="store-page-heading"><span className="section-kicker">Delivery · Payment · Confirmation</span><h1 className="section-title">A few details.</h1><p className="section-intro">Confirm your email and provide a reachable mobile number for delivery coordination.</p></div>
    {authLoading ? <p className="checkout-auth-prompt" role="status">Checking your account…</p> : !user ? <section className="checkout-auth-prompt"><ShieldCheck size={22} /><h2>Sign in to continue</h2><p>Create an ORO account or sign in, confirm your email, then return here to complete your delivery details.</p><Link className="button-dark" href="/account?next=%2Fcheckout">Sign in or create account</Link></section> : <div className="checkout-layout">
      <form className="checkout-page-form" onSubmit={placeOrder}>
        <h2>Delivery address</h2>
        <div className="checkout-fields">
          {([['name', 'Full name', 'text', 'name'], ['email', 'Email address', 'email', 'email'], ['phone', 'Mobile number', 'tel', 'tel'], ['postal', 'PIN code', 'text', 'postal-code'], ['address', 'Street address', 'text', 'street-address'], ['city', 'City', 'text', 'address-level2'], ['state', 'State', 'text', 'address-level1']] as const).map(([key, label, type, autocomplete]) => <label className={`form-field ${key === 'address' ? 'full' : ''}`} key={key}>{label}<input type={type} autoComplete={autocomplete} inputMode={key === 'postal' || key === 'phone' ? 'numeric' : undefined} required maxLength={key === 'postal' ? 6 : key === 'phone' ? 15 : 240} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} readOnly={key === 'email'} /></label>)}
        </div>
        <section className="payment-section" aria-labelledby="payment-heading"><h2 id="payment-heading">Payment</h2><label className={`payment-choice ${paymentMethod === 'cod' ? 'selected' : ''}`}><input type="radio" name="payment" value="cod" checked={paymentMethod === 'cod'} onChange={() => setPaymentMethod('cod')} /> <strong>Cash on delivery</strong><span>Pay in INR when your order arrives</span></label><label className={`payment-choice ${paymentMethod === 'upi' ? 'selected' : ''}`}><input type="radio" name="payment" value="upi" checked={paymentMethod === 'upi'} onChange={() => setPaymentMethod('upi')} /> <strong>UPI / online payment</strong><span className="payment-status">Secure Razorpay checkout</span></label>{paymentMethod === 'upi' && <p className="detail-note">Pay securely using Razorpay. UPI, cards and netbanking availability depends on your Razorpay account settings.</p>}{cancelledOrderId && user && <button className="verification-send" type="button" disabled={releasingCancelledOrder} onClick={() => void releaseCancelledOrder()}>{releasingCancelledOrder ? 'Releasing order…' : 'Release cancelled UPI order'}</button>}</section>
        {error && <p className="checkout-error" role="alert">{error}</p>}
        <button className="button-dark full-width checkout-submit" type="submit" disabled={saving}>{saving ? 'Placing your order…' : `Place order · ${formatPrice(subtotal + shipping)}`}</button>
        <p className="checkout-note">By placing your order, you agree to our terms and privacy policy.</p>
      </form>
      <aside className="cart-order-summary"><h2>Your order · {items.reduce((total, item) => total + item.quantity, 0)} {items.reduce((total, item) => total + item.quantity, 0) === 1 ? 'piece' : 'pieces'}</h2>{items.map((item) => <div key={`${item.product.id}-${item.size}-${item.color}`}><span>{item.product.name} × {item.quantity}</span><span>{formatPrice(item.product.price * item.quantity)}</span></div>)}<div><span>Shipping</span><span>{shipping ? formatPrice(shipping) : 'Complimentary'}</span></div><div className="cart-grand-total"><strong>Total</strong><strong>{formatPrice(subtotal + shipping)}</strong></div><p>Secure order placement · INR ₹</p></aside>
    </div>}
  </main></>
}
