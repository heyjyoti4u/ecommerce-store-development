import { createClient } from '@supabase/supabase-js'
import { products as demoProducts, type Product } from '@/lib/store-products'

function getServerSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function getCatalog(): Promise<Product[]> {
  const supabase = getServerSupabase()
  if (!supabase) return demoProducts
  const { data, error } = await supabase.from('products').select('id,name,category,price,image,alt,description,sizes,colors,badge,old_price').eq('active', true).order('created_at', { ascending: false })
  if (error || !data?.length) return demoProducts
  return data.map((row) => ({
    id: row.id, name: row.name, category: row.category, price: Number(row.price), oldPrice: row.old_price ? Number(row.old_price) : undefined,
    image: row.image, hoverImage: demoProducts.find((product) => product.id === row.id)?.hoverImage, alt: row.alt, description: row.description, sizes: row.sizes ?? ['One size'], colors: row.colors ?? ['Natural'], badge: row.badge ?? undefined,
  })) as Product[]
}

export async function getProduct(slug: string) {
  const catalog = await getCatalog()
  return catalog.find((product) => product.id === slug)
}
