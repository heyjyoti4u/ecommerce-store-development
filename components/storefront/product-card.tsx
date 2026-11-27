'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { Product } from '@/lib/store-products'
import { formatPrice, getProductImages } from '@/lib/store-products'
import ProductQuickView from '@/components/storefront/product-quick-view'

const colorSwatches: Record<string, string> = {
  oat: '#d8c9ad', ink: '#252722', cognac: '#9b6647', black: '#252722', cloud: '#faf9f4',
  sage: '#9ca28e', gold: '#c6a45e', silver: '#c7c8c4', butter: '#e7d899', moss: '#68775a',
  natural: '#d8c9ad', espresso: '#594438', stone: '#b9ad9b',
}

export default function ProductCard({ product }: { product: Product }) {
  const [color, setColor] = useState(product.colors[0] ?? 'Natural')
  const [quickView, setQuickView] = useState(false)
  const images = getProductImages(product, color)

  return <>
    <article className="product-card">
      <div className="product-photo-wrap">
        <Link className="product-photo" href={`/products/${product.id}`} prefetch aria-label={`View ${product.name} in ${color}`}>
          {product.badge && <span className="product-badge">{product.badge}</span>}
          <img className="product-image-primary" src={images[0] ?? product.image} alt={`${product.name} in ${color}`} loading="lazy" decoding="async" />
        </Link>
        <button className="product-add" type="button" onClick={() => setQuickView(true)} aria-label={`Choose options for ${product.name}`}><Plus size={17} /></button>
      </div>
      <div className="product-info">
        <Link href={`/products/${product.id}`} prefetch>
          <div className="product-name">{product.name}</div>
          <div className="product-category">{product.category}</div>
        </Link>
        <div className="price">{formatPrice(product.price)}{product.oldPrice && <span className="old-price">{formatPrice(product.oldPrice)}</span>}</div>
      </div>
      <div className="product-card-actions">
        <div className="collection-swatches" role="group" aria-label={`Choose a colour for ${product.name}`}>
          {product.colors.map((shade) => <button key={shade} type="button" className={`color-dot collection-swatch ${color === shade ? 'is-selected' : ''}`} aria-label={shade} aria-pressed={color === shade} title={shade} style={{ background: colorSwatches[shade.toLowerCase()] ?? '#d8c9ad' }} onClick={() => setColor(shade)} />)}
          <span className="selected-color-name">{color}</span>
        </div>
      </div>
    </article>
    {quickView && <ProductQuickView product={product} onClose={() => setQuickView(false)} />}
  </>
}
