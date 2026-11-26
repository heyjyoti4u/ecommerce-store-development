'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { LogOut, Package, RefreshCw, ShieldCheck } from 'lucide-react'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { formatPrice } from '@/lib/store-products'

type ProductRow = {
  id: string
  name: string
  category: string
  price: number
  old_price: number | null
  image: string
  alt: string
  description: string
  sizes: string[]
  colors: string[]
  badge: string | null
  active: boolean
}

export default function AdminProductsPage() {
  const [email, setEmail] = useState('')
  const [products, setProducts] = useState<ProductRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadProducts = useCallback(async () => {
    setError('')
    const supabase = getSupabaseBrowserClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      window.location.replace('/account')
      return
    }
    setEmail(user.email ?? '')
    const { data: admin, error: adminError } = await supabase
      .from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle()
    if (adminError) throw adminError
    if (!admin) {
      window.location.replace('/account')
      return
    }
    const { data, error: productsError } = await supabase
      .from('products')
      .select('id,name,category,price,old_price,image,alt,description,sizes,colors,badge,active')
      .order('category', { ascending: true })
      .order('name', { ascending: true })
    if (productsError) throw productsError
    setProducts((data ?? []) as ProductRow[])
  }, [])

  useEffect(() => {
    let active = true
    void loadProducts().catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Could not load products.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [loadProducts])

  async function saveProduct(product: ProductRow) {
    setSavingId(product.id)
    setError('')
    setNotice('')
    try {
      const { error: saveError } = await getSupabaseBrowserClient()
        .from('products')
        .update({
          price: Number(product.price),
          old_price: product.old_price === null ? null : Number(product.old_price),
          image: product.image.trim(),
          alt: product.alt.trim(),
          description: product.description.trim(),
          sizes: product.sizes,
          colors: product.colors,
          badge: product.badge?.trim() || null,
          active: product.active,
        })
        .eq('id', product.id)
      if (saveError) throw saveError
      setNotice(product.name + ' saved.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save product.')
    } finally {
      setSavingId('')
    }
  }

  async function signOut() {
    await getSupabaseBrowserClient().auth.signOut()
    window.location.replace('/account')
  }

  function changeProduct(id: string, patch: Partial<ProductRow>) {
    setProducts((current) => current.map((product) => product.id === id ? { ...product, ...patch } : product))
  }

  return <main className="store-page account-page admin-page">
    <div className="store-breadcrumb"><Link href="/">Storefront</Link><span>/</span> Admin <span>/</span> Products</div>
    <div className="store-page-heading">
      <span className="section-kicker"><ShieldCheck size={13} style={{ display: 'inline', verticalAlign: 'middle' }} /> ORO private admin</span>
      <h1 className="section-title">Product catalogue.</h1>
      <p className="section-intro">Signed in as {email || 'admin'} · Manage product content, images, options, pricing and storefront visibility.</p>
    </div>
    <nav aria-label="Admin navigation" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '24px 0' }}>
      <Link className="button-dark" href="/admin/products">Products</Link>
      <Link className="account-signout" href="/admin/orders">Orders & customers</Link>
    </nav>
    {error && <p className="account-alert account-error" role="alert">{error}</p>}
    {notice && <p className="account-alert" role="status">{notice}</p>}
    <div className="admin-list-heading">
      <div><Package size={18} /><h2>Products ({products.length})</h2></div>
      <button className="text-link" type="button" onClick={() => void loadProducts()}><RefreshCw size={14} /> Refresh</button>
    </div>
    {loading ? <p>Loading products…</p> : <div style={{ display: 'grid', gap: 12 }}>
      {products.map((product) => <article className="admin-order" key={product.id}>
        <div className="admin-order-head">
          <div><strong>{product.name}</strong><span>{product.category} · {product.id}</span></div>
          <strong>{formatPrice(Number(product.price))}</strong>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14, paddingTop: 14 }}>
          <label className="form-field">Product name
            <input value={product.name} onChange={(event) => changeProduct(product.id, { name: event.target.value })} />
          </label>
          <label className="form-field">Category
            <select value={product.category} onChange={(event) => changeProduct(product.id, { category: event.target.value })}>
              <option value="Clothing">Clothing</option><option value="Bags">Bags</option><option value="Accessories">Accessories</option>
            </select>
          </label>
          <label className="form-field">Main image URL or path
            <input value={product.image} onChange={(event) => changeProduct(product.id, { image: event.target.value })} />
          </label>
          <label className="form-field">Image alt text
            <input value={product.alt} onChange={(event) => changeProduct(product.id, { alt: event.target.value })} />
          </label>
          <label className="form-field">Sizes · comma separated
            <input value={product.sizes.join(', ')} onChange={(event) => changeProduct(product.id, { sizes: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} />
          </label>
          <label className="form-field">Colours · comma separated
            <input value={product.colors.join(', ')} onChange={(event) => changeProduct(product.id, { colors: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} />
          </label>
          <label className="form-field">Product badge
            <input value={product.badge ?? ''} onChange={(event) => changeProduct(product.id, { badge: event.target.value })} />
          </label>
          <label className="form-field" style={{ gridColumn: '1 / -1' }}>Description
            <textarea rows={3} value={product.description} onChange={(event) => changeProduct(product.id, { description: event.target.value })} />
          </label>
          <label className="form-field">Selling price (₹)
            <input type="number" min="0" step="1" value={product.price} onChange={(event) => changeProduct(product.id, { price: Number(event.target.value) })} />
          </label>
          <label className="form-field">Compare-at price (₹)
            <input type="number" min="0" step="1" value={product.old_price ?? ''} onChange={(event) => changeProduct(product.id, { old_price: event.target.value === '' ? null : Number(event.target.value) })} />
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={product.active} onChange={(event) => changeProduct(product.id, { active: event.target.checked })} />
            Visible on storefront
          </label>
          <button className="button-dark" type="button" disabled={savingId === product.id} onClick={() => void saveProduct(product)}>
            {savingId === product.id ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </article>)}
    </div>}
    <button className="account-signout" type="button" onClick={() => void signOut()}><LogOut size={15} /> Sign out</button>
  </main>
}
