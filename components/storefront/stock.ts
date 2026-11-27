import type { Product } from '@/lib/store-products'

export function getVariantStock(product: Product, size: string, color: string): number | null {
  const inventory = product.inventory
  if (!inventory) return null
  const key = size + '||' + color
  return Object.prototype.hasOwnProperty.call(inventory, key) ? inventory[key] : null
}

export function isVariantAvailable(product: Product, size: string, color: string): boolean {
  const stock = getVariantStock(product, size, color)
  return stock === null || stock > 0
}
