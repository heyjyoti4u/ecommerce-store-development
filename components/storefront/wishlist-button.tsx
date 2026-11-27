'use client'

import { useEffect, useState } from 'react'
import { Heart } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

export default function WishlistButton({ productId, className = '', onRemoved }: { productId: string; className?: string; onRemoved?: () => void }) {
  const router = useRouter()
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true
    const supabase = getSupabaseBrowserClient()
    supabase.auth.getUser().then(async ({ data }) => {
      if (!active || !data.user) { if (active) setReady(true); return }
      const { data: row } = await supabase.from('wishlist_items').select('product_id').eq('user_id', data.user.id).eq('product_id', productId).maybeSingle()
      if (active) { setSaved(Boolean(row)); setReady(true) }
    }).catch(() => { if (active) setReady(true) })
    return () => { active = false }
  }, [productId])

  async function toggleWishlist() {
    if (busy) return
    setBusy(true)
    try {
      const supabase = getSupabaseBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push(`/account?next=${encodeURIComponent('/wishlist')}`); return }
      if (saved) {
        const { error } = await supabase.from('wishlist_items').delete().eq('user_id', user.id).eq('product_id', productId)
        if (error) throw error
        setSaved(false)
        onRemoved?.()
      } else {
        const { error } = await supabase.from('wishlist_items').insert({ user_id: user.id, product_id: productId })
        if (error) throw error
        setSaved(true)
      }
    } catch (cause) {
      window.alert(cause instanceof Error ? cause.message : 'Could not update your wishlist.')
    } finally { setBusy(false) }
  }

  return <button className={`oro-wishlist-button ${saved ? 'is-saved' : ''} ${className}`} type="button" onClick={() => void toggleWishlist()} disabled={busy || !ready} aria-label={saved ? 'Remove from wishlist' : 'Add to wishlist'} aria-pressed={saved} title={saved ? 'Remove from wishlist' : 'Add to wishlist'}>
    <Heart size={17} fill={saved ? 'currentColor' : 'none'} />
  </button>
}
