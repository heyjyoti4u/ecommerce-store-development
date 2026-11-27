# ORO admin integration contract

The separate `ecommerce-admin` app connects to the same Supabase project as this storefront.

## Shared existing tables
- `products`: id, name, category, price, old_price, image, variant_images, alt, description, sizes, colors, badge, active
- `product_inventory`: product_id + size + color + stock_on_hand (only configured variants are currently stock-managed)
- `orders`: status, payment_status, payment_method, courier_partner, tracking_number, created_at plus Razorpay references
- `order_items`, `customer_profiles`, `order_status_history`

## Important storefront work before employee use
1. The storefront `lib/catalog.ts` must expose stock and active state and remain driven by the same `products` table.
2. The product/cart types currently do not include per-variant quantities. Add stock checks to product detail, quick view, cart quantity changes and checkout.
3. The current order lifecycle status values are `pending_payment`, `confirmed`, `processing`, `shipped`, `delivered`, `cancelled`. Do not introduce different status strings from the dashboard.
4. Dashboard must block confirming an online order until `payment_status='paid'`; tracking ID required before shipped.
5. Preserve Razorpay payment/refund logic. Admin must not mark payment paid/refunded manually.
6. Keep product rows with order history archived (active=false), not hard-deleted.

## Auth and security
Use same Supabase Auth project. Admin application uses its own Vercel environment and a server-only service role key. Only explicit staff Auth UUIDs may enter the dashboard. Never expose the service key or allow arbitrary public signups to create staff access.

Admin SQL:
- `supabase/admin-dashboard-access.sql` in the admin repo creates staff table + product image bucket policies.
- Same file is also copied here for storefront-side migration tracking.
