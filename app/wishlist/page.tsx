import StoreHeader from '@/components/store-header'
import WishlistPage from '@/app/wishlist/wishlist-page'
import { getCatalog } from '@/lib/catalog'

export const dynamic = 'force-dynamic'

export default async function WishlistRoute() {
  const products = await getCatalog()
  return <WishlistPage products={products} />
}
