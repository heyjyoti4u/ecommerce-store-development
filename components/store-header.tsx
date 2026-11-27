'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Menu, Search, ShoppingBag, UserRound, X } from 'lucide-react'
import { useCart } from '@/components/storefront/cart-store'
import CartDrawer from '@/components/storefront/cart-drawer'

const productLink = '/products'

export default function StoreHeader() {
  const { count, openDrawer } = useCart()
  const [open, setOpen] = useState(false)
  const [shopOpen, setShopOpen] = useState(false)

  return <>
    <div className="announcement">Complimentary shipping on orders over ₹3,000 · Made for everyday</div>

    <header className="site-header oro-header">
      <div className="header-main oro-header-main">
        <button
          className="mobile-menu"
          type="button"
          aria-label={open ? 'Close navigation' : 'Open navigation'}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>

        <Link className="brand serif" href="/" aria-label="ORO home">ORO</Link>

        <nav className="header-nav multi-nav oro-desktop-nav" aria-label="Main navigation">
          <div className="nav-group oro-nav-group">
            <Link href={productLink} prefetch className="oro-nav-trigger">Shop <span>⌄</span></Link>

            <div className="oro-mega-menu">
              <div className="oro-mega-column">
                <span className="oro-mega-heading">Explore the collection</span>
                <Link href={productLink} prefetch>All products</Link>
                <Link href={productLink} prefetch>Clothing</Link>
                <Link href={productLink} prefetch>Bags</Link>
                <Link href={productLink} prefetch>Accessories</Link>
              </div>

              <div className="oro-mega-column">
                <span className="oro-mega-heading">Featured collections</span>
                <Link href={productLink} prefetch>Best sellers</Link>
                <Link href={productLink} prefetch>New arrivals</Link>
                <Link href={productLink} prefetch>The little extras</Link>
                <Link href={productLink} prefetch>Everyday edit</Link>
              </div>

              <Link className="oro-mega-feature" href={productLink} prefetch>
                <img src="/atelier-hero.png" alt="Explore the ORO everyday collection" />
                <span>Shop <strong>the everyday edit</strong></span>
              </Link>

              <Link className="oro-mega-feature" href={productLink} prefetch>
                <img src="/atelier-hero.png" alt="Explore ORO bags and accessories" />
                <span>Find your <strong>everyday carry</strong></span>
              </Link>
            </div>
          </div>

          <Link href="/about" prefetch>Our story</Link>
          <Link href={productLink} prefetch>Explore</Link>
          <Link href={productLink} prefetch>Sale</Link>
        </nav>

        <div className="header-actions">
          <Link className="icon-action" href="/account" aria-label="My account">
            <UserRound size={18} />
          </Link>
          <Link className="icon-action" href={productLink} aria-label="Search products">
            <Search size={18} />
            <span className="action-label">Search</span>
          </Link>
          <button className="icon-action bag-link" type="button" onClick={openDrawer} aria-label={`Shopping bag, ${count} items`}>
            <ShoppingBag size={18} />
            <span className="action-label">Bag</span>
            <span className="bag-count">{count}</span>
          </button>
        </div>
      </div>

      {open && (
        <div className="oro-mobile-panel">
          <div className="oro-mobile-panel-inner">
            <div className="oro-mobile-links">
              <button
                type="button"
                className="oro-mobile-row"
                aria-expanded={shopOpen}
                onClick={() => setShopOpen((value) => !value)}
              >
                Shop <span>{shopOpen ? '−' : '+'}</span>
              </button>

              {shopOpen && (
                <div className="oro-mobile-submenu">
                  <Link href={productLink} prefetch onClick={() => setOpen(false)}>All products</Link>
                  <Link href={productLink} prefetch onClick={() => setOpen(false)}>Clothing</Link>
                  <Link href={productLink} prefetch onClick={() => setOpen(false)}>Bags</Link>
                  <Link href={productLink} prefetch onClick={() => setOpen(false)}>Accessories</Link>
                </div>
              )}

              <Link className="oro-mobile-row" href="/about" prefetch onClick={() => setOpen(false)}>Our story <span>↗</span></Link>
              <Link className="oro-mobile-row" href={productLink} onClick={() => setOpen(false)}>Explore <span>↗</span></Link>
              <Link className="oro-mobile-row" href={productLink} onClick={() => setOpen(false)}>Sale <span>↗</span></Link>
            </div>

            <div className="oro-mobile-quicklinks">
              <span>Shop by category</span>
              <Link href={productLink} prefetch onClick={() => setOpen(false)}>Clothing</Link>
              <Link href={productLink} prefetch onClick={() => setOpen(false)}>Bags</Link>
              <Link href={productLink} prefetch onClick={() => setOpen(false)}>Accessories</Link>
            </div>
          </div>
        </div>
      )}
    </header>
    <CartDrawer />
  </>
}
