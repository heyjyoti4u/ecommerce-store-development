export type Product = {
  id: string
  name: string
  category: string
  price: number
  oldPrice?: number
  image: string
  hoverImage?: string
  alt: string
  description: string
  sizes: string[]
  colors: string[]
  badge?: string
}

export const products: Product[] = [
  {
    id: 'linen-day-dress', name: 'The Linen Day Dress', category: 'Clothing', price: 4290, oldPrice: 5490,
    image: '/product-linen-dress.png', hoverImage: '/product-linen-dress-alt.png', alt: 'Ivory linen dress on a sunlit studio model',
    description: 'A softly structured, breathable linen dress made for long lunches and the in-between hours. Finished with an easy waist and deep pockets.', sizes: ['XS', 'S', 'M', 'L', 'XL'], colors: ['Oat', 'Ink'], badge: 'Bestseller',
  },
  {
    id: 'everyday-carryall', name: 'The Everyday Carryall', category: 'Bags', price: 3890, oldPrice: 4500,
    image: '/product-carryall.png', hoverImage: '/product-carryall-alt.png', alt: 'Soft tan leather everyday carryall bag',
    description: 'Your considered everyday companion. A roomy, softly structured carryall with an interior pocket and adjustable strap.', sizes: ['One size'], colors: ['Cognac', 'Black'], badge: 'Just landed',
  },
  {
    id: 'soft-structure-shirt', name: 'Soft Structure Shirt', category: 'Clothing', price: 2990, oldPrice: 3600,
    image: '/product-poplin-shirt.png', hoverImage: '/product-poplin-shirt-alt.png', alt: 'Relaxed white cotton shirt with a soft drape',
    description: 'An easy, oversized cotton poplin shirt with a curved hem and just-right drape. Wear it tucked, open, or on its own.', sizes: ['XS', 'S', 'M', 'L', 'XL'], colors: ['Cloud', 'Sage'],
  },
  {
    id: 'sculpted-hoops', name: 'Sculpted Hoops', category: 'Accessories', price: 1490, oldPrice: 1890,
    image: '/product-gold-hoops.png', hoverImage: '/product-gold-hoops-alt.png', alt: 'Sculptural gold hoops styled with a clean neutral look',
    description: 'Sculptural, lightweight hoops with a polished finish. The small detail that makes every day feel a little more put together.', sizes: ['One size'], colors: ['Gold', 'Silver'], badge: 'A little extra',
  },
  {
    id: 'weekend-knit', name: 'The Weekend Knit', category: 'Clothing', price: 3590, oldPrice: 4290,
    image: 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=1100&q=85', alt: 'Soft textured knit sweater in a muted natural color',
    description: 'A soft, breathable layer in a relaxed fit. Light enough for a sunlit morning, considered enough for every plan after.', sizes: ['XS', 'S', 'M', 'L'], colors: ['Butter', 'Moss'],
  },
  {
    id: 'weekender-tote', name: 'The Weekender Tote', category: 'Bags', price: 3290, oldPrice: 3990,
    image: 'https://images.unsplash.com/photo-1591561954557-26941169b49e?auto=format&fit=crop&w=1100&q=85', alt: 'Natural canvas tote bag for a weekend away',
    description: 'A durable, generous tote designed to move with you, from farmers market mornings to a spontaneous overnight.', sizes: ['One size'], colors: ['Natural', 'Espresso'],
  },
  {
    id: 'fine-chain-necklace', name: 'Fine Chain Necklace', category: 'Accessories', price: 1690, oldPrice: 2190,
    image: 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=1100&q=85', alt: 'Delicate fine gold chain necklace',
    description: 'A delicate everyday chain with an understated pendant. Designed for layering, lovely worn alone.', sizes: ['One size'], colors: ['Gold'],
  },
  {
    id: 'cotton-everyday-trouser', name: 'Everyday Cotton Trouser', category: 'Clothing', price: 3490, oldPrice: 4290,
    image: 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?auto=format&fit=crop&w=1100&q=85', alt: 'Relaxed straight-leg trousers in a warm neutral shade',
    description: 'Relaxed, high-rise trousers cut in soft cotton twill. A forever pair for slow days and full calendars alike.', sizes: ['XS', 'S', 'M', 'L', 'XL'], colors: ['Stone', 'Ink'],
  },
]

export const formatPrice = (amount: number) => `₹${amount.toLocaleString('en-IN')}`
