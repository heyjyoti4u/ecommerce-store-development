import Link from 'next/link'
import StoreHeader from '@/components/store-header'
import { formatPrice } from '@/lib/store-products'

export const metadata = { title: 'Order confirmation — ORO' }

export default async function OrderConfirmationPage({ searchParams }: { searchParams: Promise<{ order?: string; total?: string; paid?: string }> }) {
  const { order, total, paid } = await searchParams
  return <><StoreHeader /><main className="store-page confirmation-page">
    <span className="confirmation-check" aria-hidden="true">✓</span>
    <span className="section-kicker">{paid === '1' ? 'Payment received' : 'Thank you for choosing ORO'}</span>
    <h1>{paid === '1' ? 'Your order is confirmed.' : 'Your order is in.'}</h1>
    <p>We’ve received your order{order ? ` ${order}` : ''}. Our team will contact you shortly to confirm delivery details.</p>
    {total && Number.isFinite(Number(total)) && <p className="confirmation-total">Order total · {formatPrice(Number(total))} · {paid === '1' ? 'Paid online' : 'Cash on delivery'}</p>}
    <Link href="/account" className="button-dark">View your order</Link>
  </main></>
}
