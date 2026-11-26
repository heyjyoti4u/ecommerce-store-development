'use client'

import Link from 'next/link'
import { Plus } from 'lucide-react'
import type { Product } from '@/lib/store-products'
import { formatPrice } from '@/lib/store-products'
import { useCart } from '@/components/storefront/cart-store'

export default function ProductCard({ product }: { product: Product }) {
  const { add } = useCart()
  const size = product.sizes[0] ?? 'One size'
  const color = product.colors[0] ?? 'Natural'
  return <article className="product-card"><Link className="product-photo" href={`/products/${product.id}`} aria-label={`View ${product.name}`}>
    {product.badge && <span className="product-badge">{product.badge}</span>}<img src={product.image} alt={product.alt} loading="lazy" /><span className="product-add" aria-hidden="true"><Plus size={17} /></span>
  </Link><div className="product-info"><Link href={`/products/${product.id}`}><div className="product-name">{product.name}</div><div className="product-category">{product.category}</div></Link><div className="price">{formatPrice(product.price)}{product.oldPrice && <span className="old-price">{formatPrice(product.oldPrice)}</span>}</div></div><div className="product-card-actions"><div className="color-dots" aria-label={`Available colours: ${product.colors.join(', ')}`}>{product.colors.slice(0, 3).map((shade, index) => <span key={shade} className="color-dot" title={shade} style={{ background: ['#d8c9ad', '#9ca28e', '#faf9f4'][index % 3] }} />)}</div><button className="quick-add" type="button" onClick={() => add(product, size, color)} aria-label={`Add ${product.name} in ${color}, size ${size} to bag`}>Quick add</button></div></article>
}
