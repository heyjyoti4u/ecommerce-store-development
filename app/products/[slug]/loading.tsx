import StoreHeader from '@/components/store-header'

export default function ProductLoading() {
  return <>
    <StoreHeader />
    <main className="route-loading" aria-label="Loading product" aria-busy="true">
      <span className="sr-only">Loading product details</span>
      <div className="route-loading-detail" aria-hidden="true">
        <div className="route-loading-image" />
        <div className="route-loading-copy">
          <div className="route-loading-line" />
          <div className="route-loading-line" />
          <div className="route-loading-line" />
          <div className="route-loading-action" />
        </div>
      </div>
    </main>
  </>
}
