import Link from 'next/link'
import StoreHeader from '@/components/store-header'
import ProductCard from '@/components/storefront/product-card'
import { getCatalog } from '@/lib/catalog'

export const revalidate = 60

export const metadata = { title: 'Shop all — ORO', description: 'Explore thoughtful clothing, bags and accessories from ORO. Prices in Indian rupees.' }

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const [{ category }, products] = await Promise.all([searchParams, getCatalog()])
  const categories = ['Everything', 'Clothing', 'Bags', 'Accessories']
  const visible = category && categories.includes(category) && category !== 'Everything' ? products.filter((product) => product.category === category) : products
  return <><StoreHeader /><main className="store-page"><div className="store-breadcrumb"><Link href="/">Home</Link><span>/</span> Shop</div><div className="store-page-heading"><span className="section-kicker">Thoughtfully chosen, ready for everyday</span><h1 className="section-title">The good things.</h1><p className="section-intro">Considered clothes, useful bags and little extras. All prices shown in Indian rupees.</p></div><nav className="category-row" aria-label="Product categories">{categories.map((name) => <Link key={name} className={`category-chip ${((category ?? 'Everything') === name || (!categories.includes(category ?? '') && name === 'Everything')) ? 'is-active' : ''}`} href={name === 'Everything' ? '/products' : `/products?category=${name}`}>{name}</Link>)}</nav><div className="product-grid">{visible.map((product) => <ProductCard key={product.id} product={product} />)}</div>{!visible.length && <p>No pieces in this collection yet.</p>}</main></>
}
