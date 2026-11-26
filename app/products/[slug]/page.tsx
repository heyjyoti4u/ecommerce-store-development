import Link from 'next/link'
import { notFound } from 'next/navigation'
import StoreHeader from '@/components/store-header'
import AddToBagButton from '@/components/storefront/add-to-bag-button'
import { getCatalog, getProduct } from '@/lib/catalog'
import { formatPrice } from '@/lib/store-products'

export async function generateStaticParams() { return (await getCatalog()).map((product) => ({ slug: product.id })) }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const product = await getProduct(slug)
  return { title: product ? `${product.name} — ORO` : 'Product — ORO', description: product?.description ?? 'Shop ORO everyday essentials.' }
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const product = await getProduct(slug)
  if (!product) notFound()
  return <><StoreHeader /><main className="store-page product-detail-page"><div className="store-breadcrumb"><Link href="/">Home</Link><span>/</span><Link href="/products">Shop</Link><span>/</span>{product.name}</div><div className="product-detail-layout"><div className="product-detail-image"><img src={product.image} alt={product.alt} /></div><section className="product-detail-copy"><span className="section-kicker">{product.category} · ORO everyday</span><h1>{product.name}</h1><p className="detail-price">{formatPrice(product.price)}{product.oldPrice && <s>{formatPrice(product.oldPrice)}</s>}</p><p className="detail-description">{product.description}</p><p className="detail-note">Thoughtfully made, easy to wear, and ready to make a regular appearance.</p><AddToBagButton product={product} /><Link className="text-link" href="/shipping">Shipping & returns <span aria-hidden="true">↗</span></Link></section></div></main></>
}
