'use client'

import Image from 'next/image'
import { useMemo, useState } from 'react'
import { ArrowDown, ArrowRight, ArrowUpRight, Check, Heart, Menu, Minus, Plus, Search, ShoppingBag, Sparkles, Truck, X } from 'lucide-react'
import { formatPrice, getProductImages, products, type Product } from '@/lib/store-products'
import { cartKey, useCart } from '@/components/storefront/cart-store'
import StoreHeader from '@/components/store-header'
import { useRouter } from 'next/navigation'
const categories = ['Everything', 'Clothing', 'Bags', 'Accessories']

export default function Storefront() {
  const [category, setCategory] = useState('Everything')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Product | null>(null)
  const [selectedSize, setSelectedSize] = useState('')
  const [selectedColor, setSelectedColor] = useState('')
  const [homeColors, setHomeColors] = useState<Record<string, string>>({})
  const router = useRouter()
  const { items: cart, count: itemCount, subtotal, add, setQuantity, openDrawer } = useCart()
  const [cartOpen, setCartOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [openMobileCategory, setOpenMobileCategory] = useState('')

  const visibleProducts = useMemo(() => products.filter((product) => {
    const matchesCategory = category === 'Everything' || product.category === category
    const matchesQuery = `${product.name} ${product.category}`.toLowerCase().includes(query.toLowerCase())
    return matchesCategory && matchesQuery
  }).slice(0, 4), [category, query])
  const shipping = subtotal >= 3000 || subtotal === 0 ? 0 : 150

  function showNotice(message: string) {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2200)
  }

  function openProduct(product: Product) {
    if (window.matchMedia('(max-width: 620px)').matches) {
      router.push(`/products/${product.id}`)
      return
    }
    setSelected(product)
    setSelectedSize(product.sizes[0])
    setSelectedColor(homeColors[product.id] ?? product.colors[0])
  }

  function addToCart(product: Product, size: string, color: string) {
    add(product, size, color)
    setSelected(null)
    openDrawer()
    showNotice('Added to your bag')
  }

  function updateQuantity(index: number, change: number) {
    const item = cart[index]
    if (item) setQuantity(cartKey(item), item.quantity + change)
  }

  function startCheckout() {
    setCartOpen(false)
    router.push('/checkout')
  }

  function jumpToShop(nextCategory?: string) {
    if (nextCategory) setCategory(nextCategory)
    setMenuOpen(false)
    document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <main>
      <StoreHeader />


      <section id="top" className="hero" aria-label="New season collection">
        <Image className="hero-img" src="/atelier-hero.png" alt="Model in relaxed linen with a timeless everyday tote" fill priority sizes="100vw" />
        <div className="hero-shade" />
        <div className="hero-copy">
          <span className="eyebrow">The everyday, a little more you</span>
          <h1>Pieces for the in-between.</h1>
          <p>Thoughtful clothes and little extras for wherever the day takes you. Made to wear on repeat, and love a little longer.</p>
          <button type="button" className="button-dark" onClick={() => jumpToShop()}>Find your everyday <ArrowRight size={15} /></button>
        </div>
        <span className="hero-note">The new season edit · 01 / 03</span>
      </section>

      <div className="promise-strip" aria-label="Our promises">
        <div className="promise-item"><Sparkles size={17} /> Considered, always</div><div className="promise-item"><Heart size={17} /> Made to wear on repeat</div><div className="promise-item"><Truck size={17} /> Free shipping over ₹3,000</div><div className="promise-item"><Check size={17} /> Easy 7-day returns</div>
      </div>

      <section id="shop" className="section">
        <div className="section-head">
          <div><span className="section-kicker">A wardrobe, thoughtfully edited</span><h2 className="section-title">Meet your new regulars.</h2><p className="section-intro">A few good things to wear, carry, and keep close. Made for your real life, not just your saved folder.</p></div>
          <a className="text-link" href="#story">A note on the details <ArrowUpRight size={13} /></a>
        </div>
        {searchOpen && <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 19, borderBottom: '1px solid #deddd4', maxWidth: 350 }}><Search size={15} /><input aria-label="Search collection" placeholder="Try ‘linen’ or ‘bag’…" value={query} onChange={(event) => setQuery(event.target.value)} style={{ flex: 1, border: 0, outline: 0, background: 'transparent', padding: '12px 0', fontSize: 11 }} /><button className="close-button" aria-label="Clear search" onClick={() => { setQuery(''); setSearchOpen(false) }}><X size={14} /></button></div>}
        <div className="category-row" role="group" aria-label="Filter by category">
          {categories.map((item) => <button key={item} type="button" className={`category-chip ${category === item ? 'is-active' : ''}`} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}
        </div>
        <div className="product-grid">
          {visibleProducts.map((product) => {
            const cardColor = homeColors[product.id] ?? product.colors[0]
            const cardImages = getProductImages(product, cardColor)
            return <article className="product-card" key={product.id}>
              <div className="product-photo-wrap">
                <button type="button" className="product-photo" aria-label={`View ${product.name} in ${cardColor}`} onClick={() => openProduct(product)}>
                  {product.badge && <span className="product-badge">{product.badge}</span>}
                  <img className="product-image-primary" src={cardImages[0] ?? product.image} alt={`${product.name} in ${cardColor}`} loading="lazy" />
                  {cardImages[1] && <img className="product-image-hover" src={cardImages[1]} alt="" aria-hidden="true" loading="lazy" />}
                </button>
                <button type="button" className="product-add" aria-label={`Quick add ${product.name} in ${cardColor}`} onClick={() => addToCart(product, product.sizes[0], cardColor)}><Plus size={17} /></button>
              </div>
              <div className="product-info"><button type="button" style={{ border: 0, background: 'none', textAlign: 'left', padding: 0 }} onClick={() => openProduct(product)}><div className="product-name">{product.name}</div><div className="product-category">{product.category}</div></button><div className="price">{formatPrice(product.price)}{product.oldPrice && <span className="old-price">{formatPrice(product.oldPrice)}</span>}</div></div>
              <div className="color-dots" role="group" aria-label={`Choose a colour for ${product.name}`}>{product.colors.slice(0, 3).map((color, index) => <button key={color} type="button" className={`color-dot collection-swatch ${cardColor === color ? 'is-selected' : ''}`} aria-label={color} aria-pressed={cardColor === color} title={color} style={{ background: color.toLowerCase() === 'cloud' ? '#faf9f4' : color.toLowerCase() === 'cognac' ? '#9b6647' : color.toLowerCase() === 'moss' || color.toLowerCase() === 'sage' ? '#9ca28e' : color.toLowerCase() === 'ink' || color.toLowerCase() === 'black' ? '#252722' : color.toLowerCase() === 'gold' ? '#c6a45e' : color.toLowerCase() === 'silver' ? '#c7c8c4' : ['#d8c9ad','#b4977b','#e7dfcb'][index % 3] }} onClick={() => setHomeColors((current) => ({ ...current, [product.id]: color }))} />)}<span className="selected-color-name">{cardColor}</span></div>
            </article>
          })}
        </div>
        {visibleProducts.length === 0 && <p style={{ padding: '32px 0', color: '#77786f', fontSize: 12 }}>Nothing in this edit just yet. Try another search.</p>}
      </section>

      <section className="collection-feature" aria-label="The considered everyday edit">
        <div className="collection-photo"><img src="https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=85" alt="Friends walking through the city in relaxed everyday outfits" loading="lazy" /></div>
        <div className="collection-copy"><span className="section-kicker">For the days that become stories</span><h2>Wear it your way. Then wear it again.</h2><p>Easy layers, tactile details, and just enough something. Our pieces are designed to leave room for you in the outfit.</p><button type="button" className="button-light" onClick={() => jumpToShop('Clothing')}>Shop clothing <ArrowRight size={14} /></button></div>
      </section>

      <section id="story" className="section">
        <div className="section-head"><div><span className="section-kicker">The good things are in the details</span><h2 className="section-title">A little more considered.</h2></div><p className="section-intro">We think the best pieces are the ones you reach for without thinking. Here are a few reasons you’ll keep reaching.</p></div>
        <div className="story-grid">
          <article className="story-card"><span className="story-number">01</span><h3>Easy on purpose</h3><p>Soft, breathable fabrics and lived-in shapes. Nothing precious, everything meant to be worn.</p></article>
          <article className="story-card"><span className="story-number">02</span><h3>Fewer, better details</h3><p>Thoughtful finishing, useful pockets, comfortable fits, and a quiet little twist where it counts.</p></article>
          <article className="story-card"><span className="story-number">03</span><h3>Made for your actual day</h3><p>From first coffee to last call, these are the pieces that move with you and make getting dressed feel easy.</p></article>
        </div>
      </section>

      <section className="editorial"><span className="eyebrow">Not just a once-in-a-while thing</span><h2>Everyday good, from the first wear.</h2><p>For the slow mornings, the nearly-late ones, and all the little things in between. That’s what we’re here for.</p><button type="button" className="button-light" onClick={() => jumpToShop()}>See what feels like you <ArrowRight size={14} /></button></section>
      <section className="newsletter"><h2>Letters, not noise.</h2><p>A first look at new things, little notes from us, and 10% off your first order.</p><form className="newsletter-form" onSubmit={(event) => { event.preventDefault(); showNotice('You’re on the list. Keep an eye on your inbox.'); (event.currentTarget.elements.namedItem('newsletter-email') as HTMLInputElement).value = '' }}><input name="newsletter-email" type="email" required aria-label="Email address" placeholder="Your email address" /><button type="submit">Count me in <ArrowRight size={13} /></button></form></section>
      <footer className="footer"><div className="footer-top"><div><a className="footer-brand serif" href="#top">ORO</a><p className="footer-note">Thoughtful clothes and little extras for wherever the day takes you. From India, with a little love.</p></div><div className="footer-col"><h3>Find your way</h3><a href="#shop">Shop all</a><a href="#shop" onClick={() => setCategory('Clothing')}>Clothing</a><a href="#shop" onClick={() => setCategory('Bags')}>Bags & carry</a><a href="#shop" onClick={() => setCategory('Accessories')}>The little extras</a></div><div className="footer-col"><h3>Here to help</h3><a href="mailto:hello@oro.store">Get in touch</a><a href="#footer">Shipping & returns</a><a href="#footer">Size guide</a></div><div className="footer-col"><h3>The fine print</h3><a href="#footer">Privacy policy</a><a href="#footer">Terms of service</a><a href="#footer">Instagram ↗</a></div></div><div id="footer" className="footer-bottom"><span>© 2026 ORO STUDIO. MADE TO BE WORN.</span><span>India · INR ₹</span></div></footer>

      {selected && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null) }}><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="product-dialog-title"><button className="dialog-close" type="button" aria-label="Close product details" onClick={() => setSelected(null)}><X size={17} /></button><div className="dialog-photo"><img src={getProductImages(selected, selectedColor)[0] ?? selected.image} alt={`${selected.name} in ${selectedColor}`} /></div><div className="dialog-details"><span className="section-kicker">{selected.category} · Made to wear on repeat</span><h2 id="product-dialog-title">{selected.name}</h2><div className="dialog-price">{formatPrice(selected.price)}{selected.oldPrice && <s>{formatPrice(selected.oldPrice)}</s>}</div><p className="dialog-description">{selected.description}</p><span className="option-label">Colour · {selectedColor}</span><div className="option-row">{selected.colors.map((color, index) => <button key={color} type="button" aria-label={`Choose ${color}`} aria-pressed={selectedColor === color} className={`color-dot option-color ${selectedColor === color ? 'selected' : ''}`} style={{ width: 22, height: 22, background: color.toLowerCase() === 'black' || color.toLowerCase() === 'ink' ? '#252722' : color.toLowerCase() === 'gold' ? '#c6a45e' : ['#d8c9ad','#9ca28e','#faf9f4'][index % 3] }} onClick={() => setSelectedColor(color)} />)}</div><span className="option-label" style={{ marginTop: 20 }}>Size · <span style={{ textTransform: 'none', letterSpacing: 0 }}>{selectedSize}</span></span><div className="option-row">{selected.sizes.map((size) => <button key={size} type="button" aria-pressed={selectedSize === size} className={`option-button ${selectedSize === size ? 'selected' : ''}`} onClick={() => setSelectedSize(size)}>{size}</button>)}</div><button type="button" className="button-dark full-width" onClick={() => addToCart(selected, selectedSize, selectedColor)}>Add to bag · {formatPrice(selected.price)} <ShoppingBag size={14} /></button><a className="text-link dialog-detail-link" href={`/products/${selected.id}`}>View full details <ArrowRight size={13} /></a><p style={{ fontSize: 9, color: '#82847b', lineHeight: 1.7, marginTop: 14 }}>Complimentary shipping over ₹3,000. Easy 7-day returns.</p></div></section></div>}

      {cartOpen && <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCartOpen(false) }}><aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="bag-title"><div className="drawer-head"><h2 id="bag-title">Your bag <span style={{ color: '#85867d', fontSize: 14 }}>({itemCount})</span></h2><button className="close-button" type="button" aria-label="Close bag" onClick={() => setCartOpen(false)}><X size={18} /></button></div><div className="drawer-body">{cart.length === 0 ? <div className="empty-cart"><ShoppingBag size={25} strokeWidth={1.2} /><h3>A little room for good things.</h3><p>Your bag is waiting for its first favorite.</p><button className="button-dark" type="button" onClick={() => { setCartOpen(false); jumpToShop() }}>Find something lovely <ArrowRight size={14} /></button></div> : cart.map((item, index) => <div className="cart-line" key={`${item.product.id}-${item.size}-${item.color}`}><img src={item.product.image} alt={item.product.alt} /><div><h3>{item.product.name}</h3><p>{item.color} · {item.size}</p><div className="quantity-control"><button aria-label="Decrease quantity" onClick={() => updateQuantity(index, -1)}><Minus size={12} /></button><span>{item.quantity}</span><button aria-label="Increase quantity" onClick={() => updateQuantity(index, 1)}><Plus size={12} /></button></div><button className="remove-link" onClick={() => updateQuantity(index, -item.quantity)}>Remove</button></div><span className="cart-line-price">{formatPrice(item.product.price * item.quantity)}</span></div>)}</div>{cart.length > 0 && <div className="cart-summary"><div className="cart-subtotal"><span>Subtotal</span><strong>{formatPrice(subtotal)}</strong></div><p className="cart-shipping">{shipping === 0 ? 'Complimentary shipping included.' : `Shipping ${formatPrice(shipping)} · Complimentary over ₹3,000`}</p><button className="button-dark full-width" onClick={startCheckout}>Continue to checkout <ArrowRight size={14} /></button><p className="checkout-note">Taxes included. Shipping calculated at checkout.</p></div>}</aside></div>}

      {notice && <div className="notice" role="status">{notice}</div>}
    </main>
  )
}
