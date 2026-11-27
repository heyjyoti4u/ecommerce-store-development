import { createClient } from '@supabase/supabase-js'
import type { Product } from '@/lib/store-products'

function getServerSupabase() {
  const url = process.env.ECOMMERCE_STORE_SUPABASE_URL ?? process.env.SUPABASE_URL
    ?? process.env.NEXT_PUBLIC_ECOMMERCE_STORE_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.ECOMMERCE_STORE_SUPABASE_SECRET_KEY ?? process.env.ECOMMERCE_STORE_SUPABASE_SERVICE_ROLE_KEY
    ?? process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
    ?? process.env.NEXT_PUBLIC_ECOMMERCE_STORE_SUPABASE_ANON_KEY
    ?? process.env.NEXT_PUBLIC_ECOMMERCE_STORE_SUPABASE_PUBLISHABLE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase catalog is not configured.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function toOptions(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  if (typeof value === 'string') { try { const parsed: unknown=JSON.parse(value); return Array.isArray(parsed)?parsed.filter((item):item is string=>typeof item==='string'&&item.trim().length>0):[] } catch { return [] } }
  return []
}

export async function getCatalog(): Promise<Product[]> {
  const db = getServerSupabase()
  const [{data,error}, {data:inventory, error:inventoryError}] = await Promise.all([
    db.from('products').select('id,name,category,price,image,alt,description,sizes,colors,badge,old_price,variant_images,active').eq('active',true).order('created_at',{ascending:false}),
    db.from('product_inventory').select('product_id,size,color,stock_on_hand'),
  ])
  if (error) throw new Error('Could not load products: '+error.message)
  if (inventoryError && inventoryError.code !== '42P01') throw new Error('Could not load inventory: '+inventoryError.message)
  const stock = new Map<string,number>()
  for (const row of inventory ?? []) stock.set(row.product_id+'||'+row.size+'||'+row.color,Number(row.stock_on_hand))
  return (data??[]).map((row:any)=>({
    id:row.id,name:row.name,category:row.category,price:Number(row.price),oldPrice:row.old_price?Number(row.old_price):undefined,
    image:row.image,hoverImage:undefined,variantImages:row.variant_images??undefined,alt:row.alt,description:row.description,
    sizes:toOptions(row.sizes),colors:toOptions(row.colors),badge:row.badge??undefined,
    inventory:Object.fromEntries(stock.entries().filter(([key])=>key.startsWith(row.id+'||')).map(([key,value])=>[key.slice(row.id.length+2),value])),
  })) as Product[]
}

export async function getProduct(slug: string) {
  const catalog=await getCatalog()
  return catalog.find((product)=>product.id===slug)
}
