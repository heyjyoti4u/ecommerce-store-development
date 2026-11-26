'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
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
const CART_STORAGE_KEY = 'oro-cart-v1'
export const cartKey = (line: CartLine) => `${line.product.id}:${line.size}:${line.color}`

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartLine[]>([])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CART_STORAGE_KEY)
      if (saved) {
        const parsed: unknown = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          const valid = parsed.filter((line): line is CartLine => {
            if (!line || typeof line !== 'object') return false
            const candidate = line as Partial<CartLine>
            return Boolean(
              candidate.product && typeof candidate.product.id === 'string' &&
              typeof candidate.product.name === 'string' &&
              Number.isFinite(candidate.product.price) &&
              typeof candidate.size === 'string' &&
              typeof candidate.color === 'string' &&
              Number.isInteger(candidate.quantity) && Number(candidate.quantity) > 0 &&
              Number(candidate.quantity) <= 10
            )
          })
          setItems(valid)
        }
      }
    } catch {
      window.localStorage.removeItem(CART_STORAGE_KEY)
    } finally {
      setHydrated(true)
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items))
    } catch {
      // Checkout remains usable when browser storage is unavailable or full.
    }
  }, [items, hydrated])

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
    clear() { setItems([]); try { window.localStorage.removeItem(CART_STORAGE_KEY) } catch { /* storage may be disabled */ } },
  }), [items])
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const value = useContext(CartContext)
  if (!value) throw new Error('useCart must be used inside CartProvider')
  return value
}
