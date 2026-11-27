import StoreHeader from '@/components/store-header'

export default function ProductsLoading() {
  return <>
    <StoreHeader />
    <main className="route-loading" aria-label="Loading products" aria-busy="true">
      <span className="sr-only">Loading products</span>
      <div className="route-loading-heading" aria-hidden="true" />
      <div className="route-loading-grid" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => <div className="route-loading-card" key={index} />)}
      </div>
    </main>
  </>
}
