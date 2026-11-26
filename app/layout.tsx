import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'
import { CartProvider } from '@/components/storefront/cart-store'

export const metadata: Metadata = {
  title: 'ORO — Everyday clothes & considered accessories',
  description: 'Shop thoughtfully made clothes, bags and accessories from ORO. Everyday pieces, shipped across India with prices in INR.',
  applicationName: 'ORO',
  icons: {
    icon: [
      { url: '/icon-light-32x32.png', media: '(prefers-color-scheme: light)' },
      { url: '/icon-dark-32x32.png', media: '(prefers-color-scheme: dark)' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f8f7f3',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN">
      <body className="antialiased">
        <CartProvider>{children}</CartProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
