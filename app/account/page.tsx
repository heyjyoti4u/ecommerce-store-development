'use client'

import Link from 'next/link'
import { useEffect, useState, type FormEvent } from 'react'
import { LogOut, Package, UserRound } from 'lucide-react'
import StoreHeader from '@/components/store-header'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { formatPrice } from '@/lib/store-products'

type Profile = { id: string; user_id: string; email: string; full_name: string; phone: string; address: string; city: string; state: string; postal_code: string; avatar_url: string | null }
type Order = { id: string; order_number: string; total: number; status: string; payment_status: string; created_at: string; order_items: { product_name: string; unit_price: number; size: string; color: string; quantity: number; line_total: number }[] }

const blank = { full_name: '', phone: '', address: '', city: '', state: '', postal_code: '' }

export default function AccountPage() {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [form, setForm] = useState(blank)
  const [orders, setOrders] = useState<Order[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function loadAccount() {
    const supabase = getSupabaseBrowserClient()
    const { data: { user: current } } = await supabase.auth.getUser()
    if (!current) { setUser(null); setProfile(null); setOrders([]); setBusy(false); return }
    setUser({ id: current.id, email: current.email ?? '' })
    const [{ data: profileRow, error: profileError }, { data: orderRows, error: orderError }, { data: adminRow }] = await Promise.all([
      supabase.from('customer_profiles').select('*').eq('user_id', current.id).maybeSingle(),
      supabase.from('orders').select('id,order_number,total,status,payment_status,created_at,order_items(product_name,unit_price,size,color,quantity,line_total)').order('created_at', { ascending: false }),
      supabase.from('admin_users').select('user_id').eq('user_id', current.id).maybeSingle(),
    ])
    if (profileError) setError(profileError.message)
    if (orderError) setError(orderError.message)
    if (profileRow) {
      setProfile(profileRow as Profile)
      setForm({ full_name: profileRow.full_name ?? '', phone: profileRow.phone ?? '', address: profileRow.address ?? '', city: profileRow.city ?? '', state: profileRow.state ?? '', postal_code: profileRow.postal_code ?? '' })
    }
    setOrders((orderRows ?? []) as unknown as Order[])
    setIsAdmin(Boolean(adminRow))
    setBusy(false)
  }

  useEffect(() => {
    let alive = true
    let unsubscribe = () => {}
    try {
      const supabase = getSupabaseBrowserClient()
      supabase.auth.getSession().then(({ data }) => {
        if (alive) {
          if (data.session) void loadAccount()
          else setBusy(false)
        }
      }).catch((cause) => { if (alive) { setError(cause instanceof Error ? cause.message : 'Could not load account.'); setBusy(false) } })
      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!alive) return
        if (session) { setBusy(true); window.setTimeout(() => { if (alive) void loadAccount() }, 0) }
        else { setUser(null); setProfile(null); setOrders([]); setIsAdmin(false); setBusy(false) }
      })
      unsubscribe = () => listener.subscription.unsubscribe()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Supabase is not configured for customer accounts.')
      setBusy(false)
    }
    return () => { alive = false; unsubscribe() }
  }, [])

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setMessage(''); setSaving(true)
    try {
      const supabase = getSupabaseBrowserClient()
      if (mode === 'signup') {
        const { data, error: authError } = await supabase.auth.signUp({ email, password, options: { data: { full_name: form.full_name } } })
        if (authError) throw authError
        if (!data.session) setMessage('Account created. Please verify your email, then sign in.')
        else { setMessage('Your account is ready.'); await loadAccount() }
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
        if (authError) throw authError
        await loadAccount()
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Authentication failed.') }
    finally { setSaving(false) }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!user) return
    setSaving(true); setError(''); setMessage('')
    try {
      const supabase = getSupabaseBrowserClient()
      const { data, error: saveError } = await supabase.from('customer_profiles').update({ ...form, email: user.email, updated_at: new Date().toISOString() }).eq('user_id', user.id).select('*').single()
      if (saveError) throw saveError
      setProfile(data as Profile); setMessage('Profile saved successfully.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save profile.') }
    finally { setSaving(false) }
  }

  async function uploadAvatar(file?: File) {
    if (!file || !user) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 3 * 1024 * 1024) {
      setError('Choose a JPG, PNG or WEBP image under 3 MB.'); return
    }
    setSaving(true); setError('')
    try {
      const supabase = getSupabaseBrowserClient()
      const path = `${user.id}/avatar-${Date.now()}`
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type })
      if (uploadError) throw uploadError
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      const { data: saved, error: saveError } = await supabase.from('customer_profiles').update({ avatar_url: data.publicUrl, updated_at: new Date().toISOString() }).eq('user_id', user.id).select('*').single()
      if (saveError) throw saveError
      setProfile(saved as Profile); setMessage('Profile photo updated.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Photo upload failed.') }
    finally { setSaving(false) }
  }

  async function signOut() {
    await getSupabaseBrowserClient().auth.signOut()
    setMessage('You have signed out.')
  }

  return <><StoreHeader /><main className="store-page account-page">
    <div className="store-breadcrumb"><Link href="/">Home</Link><span>/</span> My account</div>
    <div className="store-page-heading"><span className="section-kicker">Your ORO account</span><h1 className="section-title">A little more you.</h1><p className="section-intro">Your details, delivery address and every order in one place.</p></div>
    {error && <p className="account-alert account-error" role="alert">{error}</p>}
    {message && <p className="account-alert" role="status">{message}</p>}
    {busy ? <p>Loading your account…</p> : !user ? <section className="account-auth">
      <div className="account-auth-tabs"><button className={mode === 'signin' ? 'active' : ''} onClick={() => setMode('signin')} type="button">Sign in</button><button className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')} type="button">Create account</button></div>
      <form className="account-form" onSubmit={authenticate}>
        {mode === 'signup' && <label className="form-field">Full name<input required autoComplete="name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></label>}
        <label className="form-field">Email address<input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="form-field">Password<input type="password" required minLength={8} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <button className="button-dark full-width" disabled={saving}>{saving ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}</button>
      </form>
      <p className="detail-note">Use at least 8 characters for your password. Email verification may be required.</p>
    </section> : <div className="account-layout">
      <section className="account-profile">
        <div className="account-profile-heading">
          <div className="account-avatar">{profile?.avatar_url ? <img src={profile.avatar_url} alt="Your profile" /> : <UserRound size={30} />}</div>
          <div><h2>{profile?.full_name || user.email}</h2><p>{user.email}</p></div>
        </div>
        <label className="account-upload">Change profile photo<input type="file" accept="image/png,image/jpeg,image/webp" disabled={saving} onChange={(e) => void uploadAvatar(e.target.files?.[0])} /></label>
        <form className="account-form" onSubmit={saveProfile}>
          <h2>Personal & delivery details</h2>
          {([['full_name','Full name','name'],['phone','Mobile number','tel'],['address','Street address','street-address'],['city','City','address-level2'],['state','State','address-level1'],['postal_code','PIN code','postal-code']] as const).map(([key,label,autocomplete]) => <label className="form-field" key={key}>{label}<input required autoComplete={autocomplete} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>)}
          <button className="button-dark full-width" disabled={saving}>{saving ? 'Saving…' : 'Save details'}</button>
        </form>
        {isAdmin && <Link className="account-signout" href="/admin">Open admin dashboard →</Link>}
        <button className="account-signout" type="button" onClick={() => void signOut()}><LogOut size={15} /> Sign out</button>
      </section>
      <section className="account-orders">
        <div className="account-orders-heading"><Package size={20} /><h2>Order history</h2></div>
        {!orders.length ? <div className="account-no-orders"><p>Your past orders will appear here.</p><Link className="text-link" href="/products">Explore the collection ↗</Link></div> : orders.map((order) => <article className="account-order" key={order.id}>
          <div className="account-order-top"><div><strong>{order.order_number}</strong><span>{new Date(order.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}</span></div><strong>{formatPrice(Number(order.total))}</strong></div>
          <span className="account-order-status">{order.status} · {order.payment_status}</span>
          <div className="account-order-items">{(order.order_items ?? []).map((item, index) => <p key={index}>{item.product_name} · {item.color} / {item.size} × {item.quantity}</p>)}</div>
        </article>)}
      </section>
    </div>}
  </main></>
}
