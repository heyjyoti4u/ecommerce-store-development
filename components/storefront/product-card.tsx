'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { Product } from '@/lib/store-products'
import { formatPrice } from '@/lib/store-products'
import { useCart } from '@/components/storefront/cart-store'

const colorSwatches: Record<string, string> = {
  oat: '#d8c9ad', ink: '#252722', cognac: '#9b6647', black: '#252722', cloud: '#faf9f4',
  sage: '#9ca28e', gold: '#c6a45e', silver: '#c7c8c4', butter: '#e7d899', moss: '#68775a',
  natural: '#d8c9ad', espresso: '#594438', stone: '#b9ad9b',
}

export default function ProductCard({ product }: { product: Product }) {
  const { add } = useCart()
  const [color, setColor] = useState(product.colors[0] ?? 'Natural')
  const size = product.sizes[0] ?? 'One size'
  return <article className="product-card"><Link className="product-photo" href={`/products/${product.id}`} aria-label={`View ${product.name}`}>
    {product.badge && <span className="product-badge">{product.badge}</span>}
    <img className="product-image-primary" src={product.image} alt={product.alt} loading="lazy" />
    {product.hoverImage && <img className="product-image-hover" src={product.hoverImage} alt="" aria-hidden="true" loading="lazy" />}
    <span className="product-add" aria-hidden="true"><Plus size={17} /></span>
  </Link><div className="product-info"><Link href={`/products/${product.id}`}><div className="product-name">{product.name}</div><div className="product-category">{product.category}</div></Link><div className="price">{formatPrice(product.price)}{product.oldPrice && <span className="old-price">{formatPrice(product.oldPrice)}</span>}</div></div><div className="product-card-actions"><div className="collection-swatches" role="group" aria-label={`Choose a colour for ${product.name}`}>
    {product.colors.map((shade) => <button key={shade} type="button" className={`color-dot collection-swatch ${color === shade ? 'is-selected' : ''}`} aria-label={shade} aria-pressed={color === shade} title={shade} style={{ background: colorSwatches[shade.toLowerCase()] ?? '#d8c9ad' }} onClick={() => setColor(shade)} />)}
    <span className="selected-color-name">{color}</span>
  </div><button className="quick-add" type="button" onClick={() => add(product, size, color)} aria-label={`Add ${product.name} in ${color}, size ${size} to bag`}>Quick add</button></div></article>
}
