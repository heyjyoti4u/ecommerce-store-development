import Link from 'next/link'
import { notFound } from 'next/navigation'
import StoreHeader from '@/components/store-header'
import ProductDetailExperience from '@/components/storefront/product-detail-experience'
import { getCatalog, getProduct } from '@/lib/catalog'

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
  return <><StoreHeader /><main className="store-page product-detail-page"><div className="store-breadcrumb"><Link href="/">Home</Link><span>/</span><Link href="/products">Shop</Link><span>/</span>{product.name}</div><ProductDetailExperience product={product} /></main></>
}
