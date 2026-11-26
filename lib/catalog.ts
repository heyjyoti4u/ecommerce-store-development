import { createClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { products as demoProducts, type Product } from '@/lib/store-products'

function getServerSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export const getCatalog = unstable_cache(async (): Promise<Product[]> => {
  const supabase = getServerSupabase()
  if (!supabase) return demoProducts
  const withVariants = await supabase.from('products').select('id,name,category,price,image,alt,description,sizes,colors,badge,old_price,variant_images').eq('active', true).order('created_at', { ascending: false })
  const catalog = withVariants.error
    ? await supabase.from('products').select('id,name,category,price,image,alt,description,sizes,colors,badge,old_price').eq('active', true).order('created_at', { ascending: false })
    : withVariants
  if (catalog.error || !catalog.data?.length) return demoProducts
  return catalog.data.map((row) => {
    const variantImages = 'variant_images' in row ? row.variant_images : undefined
    const toOptions = (value: unknown): string[] => {
      if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      if (typeof value === 'string') {
        try {
          const parsed: unknown = JSON.parse(value)
          return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []
        } catch {
          return []
        }
      }
      return []
    }
    return {
      id: row.id, name: row.name, category: row.category, price: Number(row.price), oldPrice: row.old_price ? Number(row.old_price) : undefined,
      image: row.image, hoverImage: demoProducts.find((product) => product.id === row.id)?.hoverImage, variantImages: variantImages ?? undefined, alt: row.alt, description: row.description,
      sizes: toOptions(row.sizes), colors: toOptions(row.colors), badge: row.badge ?? undefined,
    }
  }) as Product[]
}, ['oro-product-catalog'], { revalidate: 60, tags: ['products'] })

export async function getProduct(slug: string) {
  const catalog = await getCatalog()
  return catalog.find((product) => product.id === slug)
}
