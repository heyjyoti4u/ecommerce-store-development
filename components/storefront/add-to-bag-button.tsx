'use client'

import { useState } from 'react'
import { ShoppingBag } from 'lucide-react'
import type { Product } from '@/lib/store-products'
import { useCart } from '@/components/storefront/cart-store'

export default function AddToBagButton({ product }: { product: Product }) {
  const [size, setSize] = useState(product.sizes[0] ?? 'One size')
  const [color, setColor] = useState(product.colors[0] ?? 'Natural')
  const [added, setAdded] = useState(false)
  const { add } = useCart()
  return <div className="product-options"><span className="option-label">Colour · {color}</span><div className="option-row">{product.colors.map((value, index) => <button key={value} className={`option-button ${color === value ? 'selected' : ''}`} type="button" aria-pressed={color === value} onClick={() => setColor(value)}>{value}</button>)}</div><span className="option-label option-label-spaced">Size · {size}</span><div className="option-row">{product.sizes.map((value) => <button key={value} className={`option-button ${size === value ? 'selected' : ''}`} type="button" aria-pressed={size === value} onClick={() => setSize(value)}>{value}</button>)}</div><button className="button-dark full-width detail-add" type="button" onClick={() => { add(product, size, color); setAdded(true); window.setTimeout(() => setAdded(false), 1800) }}><ShoppingBag size={15} /> {added ? 'Added to your bag' : 'Add to bag'}</button><p className="detail-note">Free shipping on orders over ₹3,000 · Cash on delivery available</p></div>
}
