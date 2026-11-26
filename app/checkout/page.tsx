'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import StoreHeader from '@/components/store-header'
import { useCart } from '@/components/storefront/cart-store'
import { formatPrice } from '@/lib/store-products'

type CheckoutFields = { name: string; email: string; phone: string; address: string; city: string; state: string; postal: string }
const emptyForm: CheckoutFields = { name: '', email: '', phone: '', address: '', city: '', state: '', postal: '' }

export default function CheckoutPage() {
  const router = useRouter()
  const { items, count, subtotal, clear } = useCart()
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const shipping = subtotal >= 3000 || subtotal === 0 ? 0 : 150
  async function placeOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!items.length || saving) return
    setError('')
    setSaving(true)
    try {
      const response = await fetch('/api/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer: form, items: items.map(({ product, size, color, quantity }) => ({ product_id: product.id, size, color, quantity })) }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'We could not save your order. Please try again.')
      clear()
      router.push(`/order-confirmation?order=${encodeURIComponent(result.orderNumber)}&total=${encodeURIComponent(String(result.total))}`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Please try again.') } finally { setSaving(false) }
  }
  if (!items.length) return <><StoreHeader /><main className="store-page narrow-page"><div className="store-page-heading"><span className="section-kicker">Checkout</span><h1 className="section-title">Your bag is empty.</h1><Link className="button-dark" href="/products">Browse products</Link></div></main></>
  return <><StoreHeader /><main className="store-page narrow-page"><div className="store-breadcrumb"><Link href="/">Home</Link><span>/</span><Link href="/cart">Your bag</Link><span>/</span> Checkout</div><div className="store-page-heading"><span className="section-kicker">Delivery · Payment · Confirmation</span><h1 className="section-title">A few details.</h1><p className="section-intro">Your order will be placed with cash on delivery. We’ll confirm the details with you.</p></div><div className="checkout-layout"><form className="checkout-page-form" onSubmit={placeOrder}><h2>Delivery address</h2><div className="checkout-fields">{([['name', 'Full name', 'text', 'name'], ['email', 'Email address', 'email', 'email'], ['phone', 'Mobile number', 'tel', 'tel'], ['postal', 'PIN code', 'text', 'postal-code'], ['address', 'Street address', 'text', 'street-address'], ['city', 'City', 'text', 'address-level2'], ['state', 'State', 'text', 'address-level1']] as const).map(([key, label, type, autocomplete]) => <label className={`form-field ${key === 'address' ? 'full' : ''}`} key={key}>{label}<input type={type} autoComplete={autocomplete} inputMode={key === 'phone' || key === 'postal' ? 'numeric' : undefined} required maxLength={key === 'phone' ? 15 : 240} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></label>)}</div><section className="payment-section"><h2>Payment</h2><label className="payment-choice selected"><input type="radio" checked readOnly /> Cash on delivery <span>Pay in INR when your order arrives</span></label><p className="detail-note">Online payments will be enabled after a payment provider is connected.</p></section>{error && <p className="checkout-error" role="alert">{error}</p>}<button className="button-dark full-width checkout-submit" type="submit" disabled={saving}>{saving ? 'Placing your order…' : `Place order · ${formatPrice(subtotal + shipping)}`}</button><p className="checkout-note">By placing your order, you agree to our terms and privacy policy.</p></form><aside className="cart-order-summary"><h2>Your order · {count} {count === 1 ? 'piece' : 'pieces'}</h2>{items.map((line) => <div key={`${line.product.id}-${line.color}-${line.size}`}><span>{line.product.name} × {line.quantity}</span><span>{formatPrice(line.product.price * line.quantity)}</span></div>)}<div><span>Shipping</span><span>{shipping ? formatPrice(shipping) : 'Complimentary'}</span></div><div className="cart-grand-total"><strong>Total</strong><strong>{formatPrice(subtotal + shipping)}</strong></div><p>Secure order placement · INR ₹</p></aside></div></main></>
}
