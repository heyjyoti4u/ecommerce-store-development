'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ShoppingBag } from 'lucide-react'
import type { Product } from '@/lib/store-products'
import { formatPrice, getProductImages } from '@/lib/store-products'
import { useCart } from '@/components/storefront/cart-store'

const swatches: Record<string, string> = {
  oat: '#d8c9ad', ink: '#252722', cognac: '#9b6647', black: '#252722', cloud: '#faf9f4',
  sage: '#9ca28e', gold: '#c6a45e', silver: '#c7c8c4', butter: '#e7d899', moss: '#68775a',
  natural: '#d8c9ad', espresso: '#594438', stone: '#b9ad9b',
}

export default function ProductDetailExperience({ product }: { product: Product }) {
  const [color, setColor] = useState(product.colors[0] ?? 'Natural')
  const [size, setSize] = useState(product.sizes[0] ?? 'One size')
  const [activeImage, setActiveImage] = useState(0)
  const [added, setAdded] = useState(false)
  const { add } = useCart()
  const images = getProductImages(product, color)
  const imageIndex = Math.min(activeImage, images.length - 1)

  function selectColor(value: string) {
    setColor(value)
    setActiveImage(0)
  }

  return <div className="product-detail-layout">
    <div className="detail-gallery">
      <div className="product-detail-image"><img src={images[imageIndex] ?? product.image} alt={`${product.name} in ${color}`} /></div>
      {images.length > 1 && <div className="detail-thumbnails" role="group" aria-label="Product photos">
        {images.map((image, index) => <button type="button" key={`${image}-${index}`} className={`detail-thumbnail ${imageIndex === index ? 'is-active' : ''}`} aria-label={`View product photo ${index + 1}`} aria-pressed={imageIndex === index} onClick={() => setActiveImage(index)}><img src={image} alt="" /></button>)}
      </div>}
    </div>
    <section className="product-detail-copy"><span className="section-kicker">{product.category} · ORO everyday</span><h1>{product.name}</h1><p className="detail-price">{formatPrice(product.price)}{product.oldPrice && <s>{formatPrice(product.oldPrice)}</s>}</p><p className="detail-description">{product.description}</p><p className="detail-note">Thoughtfully made, easy to wear, and ready to make a regular appearance.</p><div className="product-options">
      <span className="option-label">Colour · {color}</span>
      <div className="option-row" role="group" aria-label="Choose a colour">
        {product.colors.map((value) => <button key={value} type="button" className={`color-dot detail-color-swatch ${color === value ? 'is-selected' : ''}`} style={{ backgroundColor: swatches[value.toLowerCase()] ?? '#d8c9ad' }} aria-label={value} aria-pressed={color === value} onClick={() => selectColor(value)} />)}
      </div>
      <span className="option-label option-label-spaced">Size · {size}</span>
      <div className="option-row" role="group" aria-label="Choose a size">
        {product.sizes.map((value) => <button key={value} className={`option-button ${size === value ? 'selected' : ''}`} type="button" aria-pressed={size === value} onClick={() => setSize(value)}>{value}</button>)}
      </div>
      <button className="button-dark full-width detail-add" type="button" onClick={() => { add(product, size, color); setAdded(true); window.setTimeout(() => setAdded(false), 1800) }}><ShoppingBag size={15} /> {added ? 'Added to your bag' : 'Add to bag'}</button>
      <p className="detail-note">Free shipping on orders over ₹3,000 · Cash on delivery available</p>
    </div><Link className="text-link" href="/shipping">Shipping & returns <span aria-hidden="true">↗</span></Link></section>
  </div>
}
