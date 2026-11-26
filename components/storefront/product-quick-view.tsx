'use client'

import { useState } from 'react'
import { X, ShoppingBag } from 'lucide-react'
import type { Product } from '@/lib/store-products'
import { formatPrice, getProductImages } from '@/lib/store-products'
import { useCart } from '@/components/storefront/cart-store'

const swatches: Record<string, string> = {
  oat:'#d8c9ad', ink:'#252722', cognac:'#9b6647', black:'#252722', cloud:'#faf9f4',
  sage:'#9ca28e', gold:'#c6a45e', silver:'#c7c8c4', butter:'#e7d899', moss:'#68775a',
  natural:'#d8c9ad', espresso:'#594438', stone:'#b9ad9b',
}

export default function ProductQuickView({ product, onClose }: { product: Product; onClose: () => void }) {
  const [color, setColor] = useState(product.colors[0] ?? 'Natural')
  const [size, setSize] = useState(product.sizes[0] ?? 'One size')
  const [added, setAdded] = useState(false)
  const { add } = useCart()
  const images = getProductImages(product, color)

  return <div className="quick-view-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="quick-view-modal" role="dialog" aria-modal="true" aria-labelledby="quick-view-title">
      <button className="quick-view-close" type="button" aria-label="Close quick view" onClick={onClose}><X size={20} /></button>
      <div className="quick-view-image"><img src={images[0] ?? product.image} alt={product.alt} /></div>
      <div className="quick-view-content">
        <span className="section-kicker">{product.category} · ORO everyday</span>
        <h2 id="quick-view-title">{product.name}</h2>
        <p className="quick-view-price">{formatPrice(product.price)} {product.oldPrice && <s>{formatPrice(product.oldPrice)}</s>}</p>
        <p className="quick-view-description">{product.description}</p>

        <div className="quick-view-option">
          <span className="option-label">Colour · {color}</span>
          <div className="option-row">
            {product.colors.map((value) => <button key={value} type="button" className={`color-dot detail-color-swatch ${color === value ? 'is-selected' : ''}`} style={{ backgroundColor: swatches[value.toLowerCase()] ?? '#d8c9ad' }} aria-label={value} aria-pressed={color === value} onClick={() => setColor(value)} />)}
          </div>
        </div>

        <div className="quick-view-option">
          <span className="option-label">Size · {size}</span>
          <div className="option-row">
            {product.sizes.map((value) => <button key={value} type="button" className={`option-button ${size === value ? 'selected' : ''}`} aria-pressed={size === value} onClick={() => setSize(value)}>{value}</button>)}
          </div>
        </div>

        <button className="button-dark full-width detail-add" type="button" onClick={() => { add(product, size, color); setAdded(true) }}>
          <ShoppingBag size={15} /> {added ? 'Added to your bag' : 'Add to bag'}
        </button>
        {added && <p className="quick-view-added" role="status">Added to your bag. You can keep shopping.</p>}
        <p className="detail-note">Free shipping over ₹3,000 · Cash on delivery available</p>
      </div>
    </section>
  </div>
}
