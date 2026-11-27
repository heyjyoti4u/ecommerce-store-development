import Link from 'next/link'
import StoreHeader from '@/components/store-header'
import ProductCatalog from '@/components/storefront/product-catalog'
import { getCatalog } from '@/lib/catalog'

export const revalidate = 60

export const metadata = { title: 'Shop all — ORO', description: 'Explore thoughtful clothing, bags and accessories from ORO. Prices in Indian rupees.' }

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const [{ category }, products] = await Promise.all([searchParams, getCatalog()])
  return <><StoreHeader /><main className="store-page"><div className="store-breadcrumb"><Link href="/">Home</Link><span>/</span> Shop</div><div className="store-page-heading"><span className="section-kicker">Thoughtfully chosen, ready for everyday</span><h1 className="section-title">The good things.</h1><p className="section-intro">Considered clothes, useful bags and little extras. All prices shown in Indian rupees.</p></div><ProductCatalog products={products} initialCategory={category} /></main></>
}
