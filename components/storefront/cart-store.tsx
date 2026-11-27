'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { Product } from '@/lib/store-products'

export type CartLine = { product: Product; size: string; color: string; quantity: number }
type CartContextValue = {
  items: CartLine[]
  count: number
  subtotal: number
  drawerOpen: boolean
  add: (product: Product, size: string, color: string, quantity?: number) => void
  setQuantity: (key: string, quantity: number) => void
  remove: (key: string) => void
  clear: () => void
  openDrawer: () => void
  closeDrawer: () => void
}

const CartContext = createContext<CartContextValue | null>(null)
const CART_STORAGE_KEY = 'oro-cart-v1'
export const cartKey = (line: CartLine) => `${line.product.id}:${line.size}:${line.color}`

function mergeCartLine(items: CartLine[], addition: CartLine) {
  const existing = items.find((line) => cartKey(line) === cartKey(addition))
  if (!existing) return [...items, { ...addition, quantity: Math.min(10, addition.quantity) }]
  return items.map((line) => line === existing ? { ...line, quantity: Math.min(10, line.quantity + addition.quantity) } : line)
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartLine[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const pendingAdds = useRef<CartLine[]>([])

  useEffect(() => {
    let savedItems: CartLine[] = []
    try {
      const saved = window.localStorage.getItem(CART_STORAGE_KEY)
      if (saved) {
        const parsed: unknown = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          savedItems = parsed.filter((line): line is CartLine => {
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
        }
      }
    } catch {
      try { window.localStorage.removeItem(CART_STORAGE_KEY) } catch { /* storage may be disabled */ }
    }
    setItems(pendingAdds.current.reduce(mergeCartLine, savedItems))
    pendingAdds.current = []
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items))
    } catch {
      // Checkout remains usable when browser storage is unavailable or full.
    }
  }, [items, hydrated])

  const openDrawer = useCallback(() => setDrawerOpen(true), [])
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  const value = useMemo<CartContextValue>(() => ({
    items,
    count: items.reduce((sum, line) => sum + line.quantity, 0),
    subtotal: items.reduce((sum, line) => sum + line.product.price * line.quantity, 0),
    drawerOpen,
    add(product, size, color, quantity = 1) {
      const addition = { product, size, color, quantity }
      if (!hydrated) {
        pendingAdds.current.push(addition)
        return
      }
      setItems((current) => mergeCartLine(current, addition))
    },
    setQuantity(key, quantity) {
      setItems((current) => current.flatMap((line) => cartKey(line) === key ? quantity > 0 ? [{ ...line, quantity: Math.min(10, quantity) }] : [] : [line]))
    },
    remove(key) { setItems((current) => current.filter((line) => cartKey(line) !== key)) },
    clear() { setItems([]); try { window.localStorage.removeItem(CART_STORAGE_KEY) } catch { /* storage may be disabled */ } },
    openDrawer,
    closeDrawer,
  }), [items, drawerOpen, hydrated, openDrawer, closeDrawer])
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const value = useContext(CartContext)
  if (!value) throw new Error('useCart must be used inside CartProvider')
  return value
}
