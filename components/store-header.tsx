'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Menu, ShoppingBag, X } from 'lucide-react'
import { useCart } from '@/components/storefront/cart-store'

const groups = [
  { name: 'Shop', href: '/products', links: [['All products', '/products'], ['Clothing', '/products?category=Clothing'], ['Bags', '/products?category=Bags'], ['Accessories', '/products?category=Accessories']] },
  { name: 'Discover', href: '/about', links: [['Our story', '/about'], ['Shipping & returns', '/shipping']] },
]

export default function StoreHeader() {
  const { count } = useCart()
  const [open, setOpen] = useState(false)
  return <>
    <div className="announcement">Complimentary shipping on orders over ₹3,000 · Made for everyday</div>
    <header className="site-header">
      <div className="header-main">
        <button className="mobile-menu" type="button" aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X size={19} /> : <Menu size={19} />}</button>
        <nav className="header-nav multi-nav" aria-label="Main navigation">
          {groups.map((group) => <div className="nav-group" key={group.name}>
            <Link href={group.href}>{group.name}</Link><div className="nav-submenu">{group.links.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}</div>
          </div>)}
        </nav>
        <Link className="brand serif" href="/" aria-label="ORO home">ORO</Link>
        <div className="header-actions"><Link className="icon-action bag-link" href="/cart" aria-label={`Shopping bag, ${count} items`}><ShoppingBag size={17} /><span className="action-label">Bag</span><span className="bag-count">{count}</span></Link></div>
      </div>
      {open && <nav className="mobile-nav" aria-label="Mobile navigation">{groups.flatMap((group) => group.links).map(([label, href]) => <Link key={href} href={href} onClick={() => setOpen(false)}>{label}</Link>)}</nav>}
    </header>
  </>
}
