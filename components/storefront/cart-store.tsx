'use client'

import { createContext, useContext, useMemo, useState } from 'react'
import type { Product } from '@/lib/store-products'

export type CartLine = { product: Product; size: string; color: string; quantity: number }
type CartContextValue = {
  items: CartLine[]
  count: number
  subtotal: number
  add: (product: Product, size: string, color: string, quantity?: number) => void
  setQuantity: (key: string, quantity: number) => void
  remove: (key: string) => void
  clear: () => void
}

const CartContext = createContext<CartContextValue | null>(null)
export const cartKey = (line: CartLine) => `${line.product.id}:${line.size}:${line.color}`

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartLine[]>([])
  const value = useMemo<CartContextValue>(() => ({
    items,
    count: items.reduce((sum, line) => sum + line.quantity, 0),
    subtotal: items.reduce((sum, line) => sum + line.product.price * line.quantity, 0),
    add(product, size, color, quantity = 1) {
      setItems((current) => {
        const match = current.find((line) => line.product.id === product.id && line.size === size && line.color === color)
        if (match) return current.map((line) => line === match ? { ...line, quantity: Math.min(10, line.quantity + quantity) } : line)
        return [...current, { product, size, color, quantity: Math.min(10, quantity) }]
      })
    },
    setQuantity(key, quantity) {
      setItems((current) => current.flatMap((line) => cartKey(line) === key ? quantity > 0 ? [{ ...line, quantity: Math.min(10, quantity) }] : [] : [line]))
    },
    remove(key) { setItems((current) => current.filter((line) => cartKey(line) !== key)) },
    clear() { setItems([]) },
  }), [items])
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const value = useContext(CartContext)
  if (!value) throw new Error('useCart must be used inside CartProvider')
  return value
}
