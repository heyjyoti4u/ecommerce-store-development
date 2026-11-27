'use client'

import { useEffect, useState } from 'react'
import { ShoppingBag } from 'lucide-react'
import type { Product } from '@/lib/store-products'
import { formatPrice, getProductImages } from '@/lib/store-products'
import { useCart } from '@/components/storefront/cart-store'
import ProductCard from '@/components/storefront/product-card'
import WishlistButton from '@/components/storefront/wishlist-button'

const swatches: Record<string, string> = {
  oat: '#d8c9ad', ink: '#252722', cognac: '#9b6647', black: '#252722', cloud: '#faf9f4',
  sage: '#9ca28e', gold: '#c6a45e', silver: '#c7c8c4', butter: '#e7d899', moss: '#68775a',
  natural: '#d8c9ad', espresso: '#594438', stone: '#b9ad9b',
}

export default function ProductDetailExperience({ product, recommendations }: { product: Product; recommendations: Product[] }) {
  const [color, setColor] = useState(product.colors[0] ?? '')
  const [size, setSize] = useState(product.sizes[0] ?? '')
  const [activeImage, setActiveImage] = useState(0)
  const { add, openDrawer } = useCart()
  const images = getProductImages(product, color)
  const hasColors = product.colors.length > 0
  const hasSizes = product.sizes.length > 0
  const canAddToBag = (!hasColors || Boolean(color)) && (!hasSizes || Boolean(size))
  const imageIndex = Math.min(activeImage, Math.max(images.length - 1, 0))

  useEffect(() => {
    setColor(product.colors[0] ?? '')
    setSize(product.sizes[0] ?? '')
    setActiveImage(0)
  }, [product.id, product.colors, product.sizes])

  function selectColor(value: string) {
    setColor(value)
    setActiveImage(0)
  }

  return <>
  <div className="product-detail-layout">
    <div className="detail-gallery">
      <div className="product-detail-image"><img src={images[imageIndex] ?? product.image} alt={product.alt || product.name} /></div>
      {images.length > 1 && <div className="detail-thumbnails" role="group" aria-label="Product photos">
        {images.map((image, index) => <button type="button" key={`${image}-${index}`} className={`detail-thumbnail ${imageIndex === index ? 'is-active' : ''}`} aria-label={`View product photo ${index + 1}`} aria-pressed={imageIndex === index} onClick={() => setActiveImage(index)}><img src={image} alt="" /></button>)}
      </div>}
    </div>
    <section className="product-detail-copy"><span className="section-kicker">{product.category} · ORO everyday</span><h1>{product.name}</h1><p className="detail-price">{formatPrice(product.price)}{product.oldPrice && <s>{formatPrice(product.oldPrice)}</s>}</p><p className="detail-description">{product.description}</p>{product.badge && <p className="detail-note">{product.badge}</p>}<div className="product-options">
      {product.colors.length > 0 && <>
        <span className="option-label">Colour · {color || 'Choose a colour'}</span>
        <div className="option-row" role="group" aria-label="Choose a colour">
          {product.colors.map((value) => <button key={value} type="button" className={`color-dot detail-color-swatch ${color === value ? 'is-selected' : ''}`} style={{ backgroundColor: swatches[value.toLowerCase()] ?? '#d8c9ad' }} aria-label={value} title={value} aria-pressed={color === value} onClick={() => selectColor(value)} />)}
        </div>
      </>}
      {product.sizes.length > 0 && <>
        <span className="option-label option-label-spaced">Size · {size || 'Choose a size'}</span>
        <div className="option-row" role="group" aria-label="Choose a size">
          {product.sizes.map((value) => <button key={value} className={`option-button ${size === value ? 'selected' : ''}`} type="button" aria-pressed={size === value} onClick={() => setSize(value)}>{value}</button>)}
        </div>
      </>}
      <div className="detail-purchase-actions"><WishlistButton productId={product.id} className="detail-wishlist" /><button className="button-dark full-width detail-add" type="button" disabled={!canAddToBag} onClick={() => { add(product, size, color); openDrawer() }}><ShoppingBag size={15} /> Add to bag</button>
      <p className="detail-note">Free shipping on orders over ₹3,000 · Cash on delivery available</p>
      </div>
    </div>
    <section className="product-shipping-info" aria-label="Shipping and returns">
      <h2>Shipping & returns</h2>
      <p>Orders over ₹3,000 ship free. A ₹150 delivery fee applies to smaller orders. Eligible unworn items can be returned within 7 days of delivery.</p>
      <a href="mailto:hello@oro.store">Questions? Contact us</a>
    </section>
    </section>
  </div>
  {recommendations.length > 0 && <section className="product-recommendations" aria-labelledby="recommendations-title">
    <div className="section-head"><div><span className="section-kicker">Keep looking</span><h2 className="section-title" id="recommendations-title">More things you might like.</h2></div></div>
    <div className="product-grid">{recommendations.map((item) => <ProductCard key={item.id} product={item} />)}</div>
  </section>}
  </>
}
