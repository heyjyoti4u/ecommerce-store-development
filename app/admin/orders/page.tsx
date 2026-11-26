'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { LogOut, Package, RefreshCw, ShieldCheck } from 'lucide-react'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { formatPrice } from '@/lib/store-products'

type AdminOrder = {
  id: string
  order_number: string
  total: number
  subtotal: number
  shipping: number
  status: string
  payment_status: string
  payment_method: string
  created_at: string
  customer: { full_name: string; email: string; phone: string; address: string; city: string; state: string; postal_code: string } | null
  order_items: { product_name: string; size: string; color: string; quantity: number; line_total: number }[]
}

const statuses = ['confirmed', 'processing', 'shipped', 'delivered', 'cancelled']

export default function AdminPage() {
  const [email, setEmail] = useState('')
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [allowed, setAllowed] = useState(false)

  const loadOrders = useCallback(async () => {
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
    setAllowed(true)
    const { data, error: orderError } = await supabase
      .from('orders')
      .select('id,order_number,total,subtotal,shipping,status,payment_status,payment_method,created_at,customer:customer_profiles(full_name,email,phone,address,city,state,postal_code),order_items(product_name,size,color,quantity,line_total)')
      .order('created_at', { ascending: false })
      .limit(100)
    if (orderError) throw orderError
    setOrders((data ?? []) as unknown as AdminOrder[])
  }, [])

  useEffect(() => {
    let active = true
    void loadOrders().catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Could not load admin dashboard.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [loadOrders])

  async function updateStatus(orderId: string, status: string) {
    setBusyId(orderId); setError(''); setNotice('')
    try {
      const { error: updateError } = await getSupabaseBrowserClient()
        .from('orders').update({ status }).eq('id', orderId)
      if (updateError) throw updateError
      setOrders((current) => current.map((order) => order.id === orderId ? { ...order, status } : order))
      setNotice('Order status updated.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update order status.')
    } finally {
      setBusyId('')
    }
  }

  async function signOut() {
    await getSupabaseBrowserClient().auth.signOut()
    window.location.replace('/account')
  }

  const totalRevenue = orders.filter((order) => order.status !== 'cancelled').reduce((sum, order) => sum + Number(order.total), 0)
  const pending = orders.filter((order) => ['confirmed', 'processing'].includes(order.status)).length

  return <main className="store-page account-page admin-page">
    <div className="store-breadcrumb"><Link href="/">Home</Link><span>/</span> Admin</div>
    <nav aria-label="Admin navigation" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '24px 0' }}>
      <Link className="account-signout" href="/admin/products">Products</Link>
      <Link className="button-dark" href="/admin/orders">Orders & customers</Link>
    </nav>
    <div className="store-page-heading">
      <span className="section-kicker"><ShieldCheck size={13} style={{ display: 'inline', verticalAlign: 'middle' }} /> ORO administration</span>
      <h1 className="section-title">Order dashboard.</h1>
      <p className="section-intro">Signed in as {email || 'admin'} · Manage customer orders and fulfilment.</p>
    </div>
    {error && <p className="account-alert account-error" role="alert">{error}</p>}
    {notice && <p className="account-alert" role="status">{notice}</p>}
    {loading ? <p>Loading admin dashboard…</p> : allowed && <>
      <div className="admin-stats">
        <article><span>Total orders</span><strong>{orders.length}</strong></article>
        <article><span>Awaiting fulfilment</span><strong>{pending}</strong></article>
        <article><span>Order value (latest 100)</span><strong>{formatPrice(totalRevenue)}</strong></article>
      </div>
      <div className="admin-list-heading">
        <div><Package size={18} /><h2>Recent orders</h2></div>
        <button className="text-link" type="button" onClick={() => void loadOrders()}><RefreshCw size={14} /> Refresh</button>
      </div>
      {!orders.length ? <p className="account-no-orders">No orders have been placed yet.</p> : orders.map((order) => <article className="admin-order" key={order.id}>
        <div className="admin-order-head">
          <div><strong>{order.order_number}</strong><span>{new Date(order.created_at).toLocaleString('en-IN')}</span></div>
          <strong>{formatPrice(Number(order.total))}</strong>
        </div>
        <div className="admin-order-grid">
          <section>
            <h3>Customer</h3>
            <p>{order.customer?.full_name || 'Guest customer'}</p>
            <p>{order.customer?.email || '—'} · {order.customer?.phone || '—'}</p>
            <p>{[order.customer?.address, order.customer?.city, order.customer?.state, order.customer?.postal_code].filter(Boolean).join(', ') || 'No address saved'}</p>
          </section>
          <section>
            <h3>Items</h3>
            {(order.order_items ?? []).map((item, index) => <p key={index}>{item.product_name} · {item.color} / {item.size} × {item.quantity} — {formatPrice(Number(item.line_total))}</p>)}
            <p className="admin-order-meta">Payment: {order.payment_method.toUpperCase()} · {order.payment_status}</p>
          </section>
        </div>
        <div className="admin-order-foot">
          <span className="account-order-status">{order.status}</span>
          <label>Update status
            <select aria-label={'Status for ' + order.order_number} value={order.status} disabled={busyId === order.id} onChange={(event) => void updateStatus(order.id, event.target.value)}>
              {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
        </div>
      </article>)}
      <button className="account-signout" type="button" onClick={() => void signOut()}><LogOut size={15} /> Sign out</button>
    </>}
  </main>
}

