'use client'

import Link from 'next/link'
import { useEffect, useState, type FormEvent } from 'react'
import { LogOut, Package, UserRound } from 'lucide-react'
import StoreHeader from '@/components/store-header'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { formatPrice } from '@/lib/store-products'

type Profile = { id: string; user_id: string; email: string; full_name: string; phone: string; address: string; city: string; state: string; postal_code: string; avatar_url: string | null }
type OrderEvent = { id: number; old_status: string | null; new_status: string; note: string | null; created_at: string }
type Order = { id: string; order_number: string; total: number; status: string; payment_status: string; payment_method: string; tracking_number: string | null; courier_partner: string | null; cod_confirmed_at: string | null; created_at: string; order_items: { product_name: string; unit_price: number; size: string; color: string; quantity: number; line_total: number }[]; status_history: OrderEvent[] }

const blank = { full_name: '', phone: '', address: '', city: '', state: '', postal_code: '' }

const orderStatusLabels: Record<string, string> = {
  confirmed: 'Order confirmed',
  processing: 'Being prepared',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  pending_payment: 'Awaiting UPI payment',
}

export default function AccountPage() {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [form, setForm] = useState(blank)
  const [orders, setOrders] = useState<Order[]>([])
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [awaitingVerification, setAwaitingVerification] = useState(false)
  const [pendingEmail, setPendingEmail] = useState('')
  const [resendWait, setResendWait] = useState(0)
  const [signInEmail, setSignInEmail] = useState('')
  const [signUpEmail, setSignUpEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [cancellingOrder, setCancellingOrder] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function loadAccount() {
    const supabase = getSupabaseBrowserClient()
    const { data: { user: current } } = await supabase.auth.getUser()
    if (!current) { setUser(null); setProfile(null); setOrders([]); setBusy(false); return }
    setUser({ id: current.id, email: current.email ?? '' })
    const metadataName = typeof current.user_metadata?.full_name === 'string' ? current.user_metadata.full_name : ''
    const { error: profileCreateError } = await supabase.from('customer_profiles').upsert({
      user_id: current.id,
      email: (current.email ?? '').toLowerCase(),
      full_name: metadataName || (current.email ?? '').split('@')[0],
      phone: '',
      address: '',
      city: '',
      state: '',
      postal_code: '',
    }, { onConflict: 'user_id', ignoreDuplicates: true })
    const { data: profileRow, error: profileError } = await supabase.from('customer_profiles').select('id,user_id,email,full_name,phone,address,city,state,postal_code,avatar_url').eq('user_id', current.id).maybeSingle()
    const { data: orderRows, error: orderError } = profileRow
      ? await supabase.from('orders').select('id,order_number,total,status,payment_status,payment_method,tracking_number,courier_partner,cod_confirmed_at,created_at,order_items(product_name,unit_price,size,color,quantity,line_total)').eq('customer_id', profileRow.id).order('created_at', { ascending: false })
      : { data: [], error: null }
    const orderIds = (orderRows ?? []).map((order) => order.id)
    const { data: historyRows, error: historyError } = orderIds.length
      ? await supabase.from('order_status_history').select('id,order_id,old_status,new_status,note,created_at').in('order_id', orderIds).order('created_at', { ascending: true })
      : { data: [], error: null }
    if (profileCreateError) setError(profileCreateError.message)
    if (profileError) setError(profileError.message)
    if (orderError) setError(orderError.message)
    if (historyError) setError(historyError.message)
    if (profileRow) {
      setProfile(profileRow as Profile)
      setForm({ full_name: profileRow.full_name ?? metadataName, phone: profileRow.phone ?? '', address: profileRow.address ?? '', city: profileRow.city ?? '', state: profileRow.state ?? '', postal_code: profileRow.postal_code ?? '' })
    }
    const historyByOrder = new Map<string, OrderEvent[]>()
    for (const event of historyRows ?? []) historyByOrder.set(event.order_id, [...(historyByOrder.get(event.order_id) ?? []), event])
    setOrders(((orderRows ?? []) as unknown as Order[]).map((order) => ({ ...order, status_history: historyByOrder.get(order.id) ?? [] })))
    setBusy(false)
  }

  useEffect(() => {
    if (resendWait <= 0) return
    const timer = window.setTimeout(() => setResendWait((seconds) => Math.max(0, seconds - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [resendWait])

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
        else { setUser(null); setProfile(null); setOrders([]); setBusy(false) }
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
    const activeEmail = (mode === 'signup' ? signUpEmail : signInEmail).trim().toLowerCase()
    try {
      const supabase = getSupabaseBrowserClient()
      if (mode === 'signup') {
        const requestedNext = new URLSearchParams(window.location.search).get('next')
        const safeNext = requestedNext?.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/account?verified=1'
        const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`
        const { data, error: authError } = await supabase.auth.signUp({
          email: activeEmail,
          password,
          options: { data: { full_name: form.full_name.trim() }, emailRedirectTo },
        })
        if (authError) throw authError
        if (data.session) {
          setAwaitingVerification(false)
          const requestedNext = new URLSearchParams(window.location.search).get('next')
          if (requestedNext?.startsWith('/') && !requestedNext.startsWith('//')) {
            window.location.assign(requestedNext)
            return
          }
          setMessage('Your account is ready.')
          await loadAccount()
        } else {
          setPendingEmail(activeEmail)
          setAwaitingVerification(true)
          if (data.user && data.user.identities?.length === 0) {
            const { error: resendError } = await supabase.auth.resend({
              type: 'signup',
              email: activeEmail,
              options: { emailRedirectTo },
            })
            if (resendError) throw resendError
            setResendWait(60)
            setMessage('This email already has an unverified account. We have sent a fresh verification link. Check your inbox and spam folder.')
          } else {
            setResendWait(60)
            setMessage('Check your inbox and spam folder for the verification link. You can request another link after the short resend cooldown.')
          }
        }
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: activeEmail, password })
        if (authError) {
          if (authError.message.toLowerCase().includes('email not confirmed')) {
            setPendingEmail(activeEmail)
            setAwaitingVerification(true)
            return
          }
          throw authError
        }
        setAwaitingVerification(false)
        const requestedNext = new URLSearchParams(window.location.search).get('next')
        if (requestedNext?.startsWith('/') && !requestedNext.startsWith('//')) {
          window.location.assign(requestedNext)
          return
        }
        await loadAccount()
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Authentication failed.') }
    finally { setSaving(false) }
  }

  async function resendVerification() {
    if (!pendingEmail || resendWait > 0 || saving) return
    setSaving(true); setError(''); setMessage('')
    try {
      const requestedNext = new URLSearchParams(window.location.search).get('next')
      const safeNext = requestedNext?.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/account?verified=1'
      const { error: resendError } = await getSupabaseBrowserClient().auth.resend({
        type: 'signup',
        email: pendingEmail,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}` },
      })
      if (resendError) throw resendError
      setResendWait(60)
      setMessage('A new verification email has been sent. Please check your inbox and spam folder. You can resend again after 60 seconds.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not resend verification email.')
    } finally { setSaving(false) }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!user) return
    setSaving(true); setError(''); setMessage('')
    try {
      const supabase = getSupabaseBrowserClient()
      const { data, error: saveError } = await supabase.from('customer_profiles').upsert({ user_id: user.id, email: user.email.toLowerCase(), ...form, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }).select('*').single()
      if (saveError) throw saveError
      setProfile(data as Profile); setIsEditingProfile(false); setMessage('Profile saved successfully.')
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

  async function cancelOrder(orderId: string, refreshRefund = false) {
    if (!user || cancellingOrder || (!refreshRefund && !window.confirm('Cancel this order? If it has been paid, Razorpay will process the refund to your original payment method.'))) return
    setCancellingOrder(orderId); setError(''); setMessage('')
    try {
      const { data: { session } } = await getSupabaseBrowserClient().auth.getSession()
      if (!session?.access_token) throw new Error('Sign in again to cancel this order.')
      const response = await fetch('/api/orders/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ orderId, reason: 'Customer requested cancellation' }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'Could not cancel this order.')
      setMessage(result.paymentStatus === 'refund_pending' ? refreshRefund ? 'Your refund is still processing with Razorpay.' : 'Order cancelled. Your refund is processing with Razorpay.' : result.paymentStatus === 'refunded' ? refreshRefund ? 'Your refund is complete.' : 'Order cancelled and refund issued through Razorpay.' : 'Order cancelled successfully.')
      await loadAccount()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not cancel this order.')
    } finally {
      setCancellingOrder('')
    }
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
    {busy ? <p>Loading your account…</p> : !user ? awaitingVerification ? <section className="account-auth account-verification">
      <div className="verification-mark"><Package size={25} /></div>
      <span className="section-kicker">One last step</span>
      <h2>Waiting for email verification.</h2>
      <p>We sent a confirmation link to <strong>{pendingEmail}</strong>. Open that email and click the link to activate your ORO account. This page will not show your profile until your email is verified.</p>
      <button className="button-dark full-width" type="button" disabled={saving || resendWait > 0} onClick={() => void resendVerification()}>{saving ? 'Sending…' : resendWait > 0 ? `Resend verification email (${resendWait}s)` : 'Resend verification email'}</button>
      <button className="verification-back" type="button" onClick={() => { setAwaitingVerification(false); setMode('signin'); setMessage(''); setError('') }}>Back to sign in</button>
    </section> : <section className="account-auth">
      <div className="account-auth-tabs"><button className={mode === 'signin' ? 'active' : ''} onClick={() => { setMode('signin'); setPassword(''); setError(''); setMessage('') }} type="button">Sign in</button><button className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setPassword(''); setError(''); setMessage('') }} type="button">Create account</button></div>
      <form className="account-form" onSubmit={authenticate}>
        {mode === 'signup' && <label className="form-field">Full name<input required autoComplete="name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></label>}
        <label className="form-field">Email address<input type="email" required autoComplete="email" autoComplete={mode === 'signup' ? 'section-signup email' : 'section-signin email'} value={mode === 'signup' ? signUpEmail : signInEmail} onChange={(e) => mode === 'signup' ? setSignUpEmail(e.target.value) : setSignInEmail(e.target.value)} /></label>
        <label className="form-field">Password<input type="password" required minLength={6} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <button className="button-dark full-width" disabled={saving}>{saving ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}</button>
        {mode === 'signin' && <Link className="account-forgot-link" href="/account/forgot-password">Forgot your password?</Link>}
      </form>
      <p className="detail-note">Passwords are securely managed by Supabase Authentication. Email verification is required for new accounts.</p>
    </section> : <div className="account-layout">
      <section className="account-profile">
        <div className="account-profile-heading">
          <div className="account-avatar">{profile?.avatar_url ? <img src={profile.avatar_url} alt="Your profile" /> : <UserRound size={30} />}</div>
          <div><h2>{profile?.full_name || user.email}</h2><p>{user.email}</p></div>
        </div>
        <label className="account-upload"><span>{saving ? 'Uploading…' : 'Change profile photo'}</span><input type="file" accept="image/png,image/jpeg,image/webp" disabled={saving} onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadAvatar(file); e.currentTarget.value = '' }} /></label>
        <p className="account-photo-hint">JPG, PNG or WEBP · maximum 3 MB</p>
        <form className="account-form account-details-form" onSubmit={saveProfile}>
          <div className="account-details-heading">
            <div className="account-details-copy">
              <h2>Personal & delivery details</h2>
              <p>Keep your details up to date for a smoother checkout and accurate delivery. Your saved information stays securely linked to your ORO account.</p>
            </div>
            {!isEditingProfile && <button className="button-dark account-edit-button" type="button" onClick={() => { setForm({ full_name: profile?.full_name ?? '', phone: profile?.phone ?? '', address: profile?.address ?? '', city: profile?.city ?? '', state: profile?.state ?? '', postal_code: profile?.postal_code ?? '' }); setIsEditingProfile(true); setMessage(''); setError('') }}>Edit profile</button>}
          </div>
          {([['full_name','Full name','name'],['phone','Mobile number','tel'],['address','Street address','street-address'],['city','City','address-level2'],['state','State','address-level1'],['postal_code','PIN code','postal-code']] as const).map(([key,label,autocomplete]) => <label className="form-field" key={key}>{label}<input required disabled={!isEditingProfile || saving} autoComplete={autocomplete} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>)}
          {isEditingProfile && <div className="account-edit-actions">
            <button className="button-dark full-width" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
            <button className="verification-back" type="button" disabled={saving} onClick={() => { setForm({ full_name: profile?.full_name ?? '', phone: profile?.phone ?? '', address: profile?.address ?? '', city: profile?.city ?? '', state: profile?.state ?? '', postal_code: profile?.postal_code ?? '' }); setIsEditingProfile(false); setError(''); setMessage('') }}>Cancel</button>
          </div>}
        </form>
        <button className="account-signout" type="button" onClick={() => void signOut()}><LogOut size={15} /> Sign out</button>
      </section>
      <section className="account-orders">
        <div className="account-orders-heading"><Package size={20} /><h2>Order history</h2></div>
        {!orders.length ? <div className="account-no-orders"><p>Your past orders will appear here.</p><Link className="text-link" href="/products">Explore the collection ↗</Link></div> : <div className="account-orders-list">{orders.map((order) => <article className="account-order" key={order.id}>
          <div className="account-order-top"><div><strong>{order.order_number}</strong><span>{new Date(order.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}</span></div><strong>{formatPrice(Number(order.total))}</strong></div>
          <span className="account-order-status">{orderStatusLabels[order.status] ?? order.status} · Payment: {order.payment_status === 'refund_pending' ? 'refund processing' : order.payment_status}</span>
          {order.payment_method === 'cod' && order.cod_confirmed_at && <p className="account-order-note">Cash on delivery confirmed · {new Date(order.cod_confirmed_at).toLocaleDateString('en-IN', { day:'numeric', month:'short' })}</p>}
          {order.tracking_number && <p className="account-order-note">Tracking · {order.courier_partner ? `${order.courier_partner} · ` : ''}<strong>{order.tracking_number}</strong></p>}
          <div className="account-order-items">{(order.order_items ?? []).map((item, index) => <p key={index}>{item.product_name} · {item.color} / {item.size} × {item.quantity}</p>)}</div>
          {order.status_history.length > 0 && <ol className="account-order-timeline" aria-label={`Status history for ${order.order_number}`}>{order.status_history.map((event) => <li key={event.id}><span>{orderStatusLabels[event.new_status] ?? event.new_status}</span><time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString('en-IN', { dateStyle:'medium', timeStyle:'short' })}</time>{event.note && <small>{event.note}</small>}</li>)}</ol>}
          {['pending_payment', 'confirmed', 'processing'].includes(order.status) && <button className="account-order-cancel" type="button" disabled={Boolean(cancellingOrder)} onClick={() => void cancelOrder(order.id)}>{cancellingOrder === order.id ? 'Cancelling…' : 'Cancel order'}</button>}
          {order.status === 'cancelled' && order.payment_status === 'refund_pending' && <button className="account-order-cancel" type="button" disabled={Boolean(cancellingOrder)} onClick={() => void cancelOrder(order.id, true)}>{cancellingOrder === order.id ? 'Checking…' : 'Check refund status'}</button>}
        </article>)}</div>}
      </section>
    </div>}
  </main></>
}
