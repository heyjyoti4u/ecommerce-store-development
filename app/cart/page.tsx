'use client'

import Link from 'next/link'
import Image from 'next/image'
import StoreHeader from '@/components/store-header'
import { cartKey, useCart } from '@/components/storefront/cart-store'
import { formatPrice } from '@/lib/store-products'

export default function CartPage() {
  const { items, subtotal, setQuantity, remove } = useCart()
  const shipping = subtotal >= 3000 || subtotal === 0 ? 0 : 150
  return <><StoreHeader /><main className="store-page narrow-page"><div className="store-breadcrumb"><Link href="/">Home</Link><span>/</span> Your bag</div><div className="store-page-heading"><span className="section-kicker">A few good things</span><h1 className="section-title">Your bag.</h1></div>{items.length === 0 ? <div className="cart-empty"><p>Your bag is ready for something lovely.</p><Link className="button-dark" href="/products">Explore the collection</Link></div> : <div className="cart-layout"><section className="cart-items" aria-label="Items in your bag">{items.map((line) => <article className="cart-page-line" key={cartKey(line)}><Image src={line.product.image} alt={line.product.alt} width={130} height={160} /><div className="cart-page-info"><Link href={`/products/${line.product.id}`} className="product-name">{line.product.name}</Link><p>{line.color} · {line.size}</p><div className="quantity-control"><button type="button" aria-label={`Decrease ${line.product.name}`} onClick={() => setQuantity(cartKey(line), line.quantity - 1)}>−</button><span>{line.quantity}</span><button type="button" aria-label={`Increase ${line.product.name}`} onClick={() => setQuantity(cartKey(line), line.quantity + 1)}>+</button></div><button className="remove-link" type="button" onClick={() => remove(cartKey(line))}>Remove</button></div><strong>{formatPrice(line.product.price * line.quantity)}</strong></article>)}</section><aside className="cart-order-summary"><h2>Order summary</h2><div><span>Subtotal</span><span>{formatPrice(subtotal)}</span></div><div><span>Shipping</span><span>{shipping ? formatPrice(shipping) : 'Complimentary'}</span></div><div className="cart-grand-total"><strong>Total</strong><strong>{formatPrice(subtotal + shipping)}</strong></div><Link href="/checkout" className="button-dark full-width">Continue to checkout</Link><p>All prices are in INR. Cash on delivery available.</p></aside></div>}</main></>
}
