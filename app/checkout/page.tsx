'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import StoreHeader from '@/components/store-header'
import { useCart } from '@/components/storefront/cart-store'
import { formatPrice } from '@/lib/store-products'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

type CheckoutFields = { name: string; email: string; phone: string; address: string; city: string; state: string; postal: string }
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
  const [sendingCode, setSendingCode] = useState(false)
  const [pendingPhone, setPendingPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [phoneVerified, setPhoneVerified] = useState(false)
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
        setPhoneVerified(Boolean(currentUser.phone_confirmed_at && digitsOnly(currentUser.phone ?? '') === digitsOnly(data?.phone ?? '')))
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load your account.')
      } finally {
        if (active) setAuthLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  const shipping = subtotal >= 3000 || subtotal === 0 ? 0 : 150

  async function sendPhoneCode() {
    if (!user || digitsOnly(form.phone).length !== 10 || sendingCode || saving) return
    setError('')
    setSendingCode(true)
    try {
      const phone = `+91${digitsOnly(form.phone)}`
      const { error: updateError } = await getSupabaseBrowserClient().auth.updateUser({ phone })
      if (updateError) throw updateError
      setPendingPhone(phone)
      setOtp('')
      setPhoneVerified(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send a verification code. Check that phone verification is enabled for this Supabase project.')
    } finally {
      setSendingCode(false)
    }
  }

  async function verifyPhoneCode() {
    if (!pendingPhone || otp.trim().length !== 6 || saving) return
    setError('')
    setSaving(true)
    try {
      const { data, error: verifyError } = await getSupabaseBrowserClient().auth.verifyOtp({ phone: pendingPhone, token: otp.trim(), type: 'phone_change' })
      if (verifyError) throw verifyError
      if (!data.user || !data.user.phone_confirmed_at) throw new Error('The number is not confirmed yet. Please try the latest code.')
      const verifiedUser = data.user
      setUser(verifiedUser)
      setForm((current) => ({ ...current, phone: digitsOnly(verifiedUser.phone ?? pendingPhone) }))
      setPhoneVerified(true)
      setPendingPhone('')
      setOtp('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That code could not be verified. Please try again.')
    } finally {
      setSaving(false)
    }
  }

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
    if (!phoneVerified || !user.phone_confirmed_at || digitsOnly(user.phone ?? '') !== digitsOnly(form.phone)) { setError('Confirm the mobile number shown below before placing your order.'); return }
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
        if (!result.checkoutUrl) throw new Error('Secure UPI checkout is not available right now.')
        window.location.assign(result.checkoutUrl)
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
    <div className="store-page-heading"><span className="section-kicker">Delivery · Payment · Confirmation</span><h1 className="section-title">A few details.</h1><p className="section-intro">Your email and mobile number must be confirmed before you place an order.</p></div>
    {authLoading ? <p className="checkout-auth-prompt" role="status">Checking your account…</p> : !user ? <section className="checkout-auth-prompt"><ShieldCheck size={22} /><h2>Sign in to continue</h2><p>Create an ORO account or sign in, confirm your email, then return here to complete delivery details and verify your mobile number.</p><Link className="button-dark" href="/account?next=%2Fcheckout">Sign in or create account</Link></section> : <div className="checkout-layout">
      <form className="checkout-page-form" onSubmit={placeOrder}>
        <h2>Delivery address</h2>
        <div className="checkout-fields">
          {([['name', 'Full name', 'text', 'name'], ['email', 'Email address', 'email', 'email'], ['phone', 'Mobile number', 'tel', 'tel'], ['postal', 'PIN code', 'text', 'postal-code'], ['address', 'Street address', 'text', 'street-address'], ['city', 'City', 'text', 'address-level2'], ['state', 'State', 'text', 'address-level1']] as const).map(([key, label, type, autocomplete]) => key === 'phone' ? <label className="form-field phone-field" key={key}>{label}<span className="phone-input-row"><input type={type} autoComplete={autocomplete} inputMode="numeric" required maxLength={15} value={form.phone} onChange={(event) => { setForm({ ...form, phone: event.target.value }); setPhoneVerified(Boolean(user.phone_confirmed_at && digitsOnly(user.phone ?? '') === digitsOnly(event.target.value))); setPendingPhone('') }} />{phoneVerified && <span className="verified-mark" aria-label="Mobile number verified"><CheckCircle2 size={17} /> Verified</span>}</span></label> : <label className={`form-field ${key === 'address' ? 'full' : ''}`} key={key}>{label}<input type={type} autoComplete={autocomplete} inputMode={key === 'postal' ? 'numeric' : undefined} required maxLength={key === 'postal' ? 6 : 240} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} readOnly={key === 'email'} /></label>)}
        </div>
        {!phoneVerified && <div className="phone-verification-panel"><p>We’ll send a one-time code through the phone provider configured for this store. SMS is the usual channel; WhatsApp works only if the provider is configured for it.</p>{pendingPhone ? <div className="otp-entry"><label className="form-field">6-digit confirmation code<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} /></label><button className="button-dark" type="button" disabled={saving || otp.length !== 6} onClick={() => void verifyPhoneCode()}>{saving ? 'Checking…' : 'Verify number'}</button><button className="verification-send" type="button" disabled={sendingCode} onClick={() => void sendPhoneCode()}>{sendingCode ? 'Sending…' : 'Resend code'}</button></div> : <button className="verification-send" type="button" disabled={sendingCode || digitsOnly(form.phone).length !== 10} onClick={() => void sendPhoneCode()}>{sendingCode ? 'Sending code…' : 'Send confirmation code'}</button>}</div>}
        {phoneVerified && <p className="phone-confirmed-note"><CheckCircle2 size={15} /> This mobile number is confirmed.</p>}
        <section className="payment-section" aria-labelledby="payment-heading"><h2 id="payment-heading">Payment</h2><label className={`payment-choice ${paymentMethod === 'cod' ? 'selected' : ''}`}><input type="radio" name="payment" value="cod" checked={paymentMethod === 'cod'} onChange={() => setPaymentMethod('cod')} /> <strong>Cash on delivery</strong><span>Pay in INR when your order arrives</span></label><label className={`payment-choice ${paymentMethod === 'upi' ? 'selected' : ''}`}><input type="radio" name="payment" value="upi" checked={paymentMethod === 'upi'} onChange={() => setPaymentMethod('upi')} /> <strong>UPI / online payment</strong><span className="payment-status">Secure Stripe checkout</span></label>{paymentMethod === 'upi' && <p className="detail-note">UPI payment uses Stripe Checkout. Apply the supplied Supabase order-lifecycle SQL before enabling this payment method in production.</p>}{cancelledOrderId && user && <button className="verification-send" type="button" disabled={releasingCancelledOrder} onClick={() => void releaseCancelledOrder()}>{releasingCancelledOrder ? 'Releasing order…' : 'Release cancelled UPI order'}</button>}</section>
        {error && <p className="checkout-error" role="alert">{error}</p>}
        <button className="button-dark full-width checkout-submit" type="submit" disabled={saving || !phoneVerified}>{saving ? 'Placing your order…' : `Place order · ${formatPrice(subtotal + shipping)}`}</button>
        <p className="checkout-note">By placing your order, you agree to our terms and privacy policy.</p>
      </form>
      <aside className="cart-order-summary"><h2>Your order · {items.reduce((total, item) => total + item.quantity, 0)} {items.reduce((total, item) => total + item.quantity, 0) === 1 ? 'piece' : 'pieces'}</h2>{items.map((item) => <div key={`${item.product.id}-${item.size}-${item.color}`}><span>{item.product.name} × {item.quantity}</span><span>{formatPrice(item.product.price * item.quantity)}</span></div>)}<div><span>Shipping</span><span>{shipping ? formatPrice(shipping) : 'Complimentary'}</span></div><div className="cart-grand-total"><strong>Total</strong><strong>{formatPrice(subtotal + shipping)}</strong></div><p>Secure order placement · INR ₹</p></aside>
    </div>}
  </main></>
}
