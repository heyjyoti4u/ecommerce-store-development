'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { Minus, Plus, ShoppingBag, X } from 'lucide-react'
import { cartKey, useCart } from '@/components/storefront/cart-store'
import { formatPrice, getProductImages } from '@/lib/store-products'
import { getVariantStock } from '@/components/storefront/stock'

export default function CartDrawer() {
  const { items, count, subtotal, drawerOpen, closeDrawer, setQuantity, remove } = useCart()
  const shipping = subtotal >= 3000 || subtotal === 0 ? 0 : 150

  useEffect(() => {
    if (!drawerOpen) return
    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDrawer()
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [drawerOpen, closeDrawer])

  if (!drawerOpen) return null

  return (
    <div className="overlay cart-drawer-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDrawer() }}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="cart-drawer-title">
        <div className="drawer-head">
          <h2 id="cart-drawer-title">Your bag <span className="cart-drawer-count">({count})</span></h2>
          <button className="close-button" type="button" aria-label="Close bag" onClick={closeDrawer}><X size={18} /></button>
        </div>
        {items.length === 0 ? (
          <div className="cart-drawer-empty">
            <ShoppingBag size={25} strokeWidth={1.2} />
            <h3>Your bag is empty.</h3>
            <p>Find a few good things for everyday.</p>
            <Link className="button-dark" href="/products" onClick={closeDrawer}>Shop the collection</Link>
          </div>
        ) : (
          <>
            <div className="drawer-body">
              {items.map((item) => (
                <article className="cart-line" key={cartKey(item)}>
                  <img src={getProductImages(item.product, item.color)[0] ?? item.product.image} alt={item.product.alt} />
                  <div>
                    <h3>{item.product.name}</h3>
                    <p>{[item.color, item.size].filter(Boolean).join(' · ')}</p>
                    <div className="quantity-control" aria-label={`Quantity for ${item.product.name}`}>
                      <button type="button" aria-label={`Decrease ${item.product.name} quantity`} onClick={() => setQuantity(cartKey(item), item.quantity - 1)}><Minus size={12} /></button>
                      <span>{item.quantity}</span>
                      <button type="button" aria-label={`Increase ${item.product.name} quantity`} disabled={getVariantStock(item.product, item.size, item.color) !== null && item.quantity >= Math.min(10, getVariantStock(item.product, item.size, item.color) ?? 0)} onClick={() => setQuantity(cartKey(item), item.quantity + 1)}><Plus size={12} /></button>
                    </div>
                    {getVariantStock(item.product, item.size, item.color) === 0 && <small className="cell-sub" role="status">Out of stock — remove this item to continue</small>}
                    <button className="remove-link" type="button" onClick={() => remove(cartKey(item))}>Remove</button>
                  </div>
                  <span className="cart-line-price">{formatPrice(item.product.price * item.quantity)}</span>
                </article>
              ))}
            </div>
            <div className="cart-summary">
              <div className="cart-subtotal"><span>Subtotal</span><strong>{formatPrice(subtotal)}</strong></div>
              <p className="cart-shipping">{shipping === 0 ? 'Complimentary shipping included.' : `Shipping ${formatPrice(shipping)} · Complimentary over ₹3,000`}</p>
              <Link className="button-dark full-width" href="/checkout" onClick={closeDrawer}>Continue to checkout</Link>
              <Link className="cart-drawer-view-bag" href="/cart" onClick={closeDrawer}>View bag</Link>
            </div>
          </>
        )}
      </aside>
    </div>
  )
}
