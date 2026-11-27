'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Heart, ShoppingBag } from 'lucide-react'
import StoreHeader from '@/components/store-header'
import ProductCard from '@/components/storefront/product-card'
import type { Product } from '@/lib/store-products'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

export default function WishlistPage({ products }: { products: Product[] }) {
  const [ids, setIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [signedIn, setSignedIn] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const supabase = getSupabaseBrowserClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!active) return
        setSignedIn(Boolean(user))
        if (user) {
          const { data, error: queryError } = await supabase.from('wishlist_items').select('product_id').eq('user_id', user.id).order('created_at', { ascending: false })
          if (queryError) throw queryError
          if (active) setIds((data ?? []).map((row) => row.product_id))
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load your wishlist.')
      } finally { if (active) setLoading(false) }
    }
    void load()
    return () => { active = false }
  }, [])

  const savedProducts = useMemo(() => ids.map((id) => products.find((product) => product.id === id)).filter((product): product is Product => Boolean(product)), [ids, products])

  return <><StoreHeader /><main className="store-page wishlist-page">
    <div className="store-breadcrumb"><Link href="/">Home</Link><span>/</span> Wishlist</div>
    <div className="store-page-heading"><span className="section-kicker">Your saved pieces</span><h1 className="section-title">The ones you love.</h1><p className="section-intro">Keep your favourites close and come back whenever you're ready.</p></div>
    {loading ? <p>Loading your wishlist…</p> : error ? <p className="account-alert account-error" role="alert">{error}</p> : !signedIn ? <div className="account-no-orders"><Heart size={24}/><p>Sign in to see and save your favourite pieces.</p><Link className="button-dark" href="/account?next=%2Fwishlist">Sign in</Link></div> : savedProducts.length ? <><p className="catalog-result-count">{savedProducts.length} saved {savedProducts.length === 1 ? 'piece' : 'pieces'}</p><div className="product-grid">{savedProducts.map((product) => <ProductCard key={product.id} product={product} onWishlistRemoved={() => setIds((current) => current.filter((id) => id !== product.id))}/>)}</div></> : <div className="account-no-orders"><Heart size={24}/><p>Your wishlist is waiting for its first favourite.</p><Link className="text-link" href="/products"><ShoppingBag size={15}/> Explore the collection</Link></div>}
  </main></>
}
