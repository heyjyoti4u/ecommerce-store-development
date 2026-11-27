'use client'

import { useMemo, useState } from 'react'
import ProductCard from '@/components/storefront/product-card'
import type { Product } from '@/lib/store-products'

const categories = ['Everything', 'Clothing', 'Bags', 'Accessories']

export default function ProductCatalog({ products, initialCategory = 'Everything' }: { products: Product[]; initialCategory?: string }) {
  const [category, setCategory] = useState(categories.includes(initialCategory) ? initialCategory : 'Everything')
  const [query, setQuery] = useState('')
  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return products.filter((product) => {
      const matchesCategory = category === 'Everything' || product.category === category
      const matchesQuery = !normalizedQuery || `${product.name} ${product.category}`.toLocaleLowerCase().includes(normalizedQuery)
      return matchesCategory && matchesQuery
    })
  }, [category, products, query])

  return <>
    <div className="catalog-controls">
      <nav className="category-row" aria-label="Product categories">
        {categories.map((name) => <button key={name} type="button" className={`category-chip ${category === name ? 'is-active' : ''}`} aria-pressed={category === name} onClick={() => setCategory(name)}>{name}</button>)}
      </nav>
      <label className="catalog-search">Search collection<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pieces" /></label>
    </div>
    <p className="catalog-result-count" aria-live="polite">{visible.length} {visible.length === 1 ? 'piece' : 'pieces'}</p>
    {visible.length ? <div className="product-grid">{visible.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <p className="catalog-empty">No pieces found. Try another category or search.</p>}
  </>
}
