# ORO storefront setup

## Supabase

1. Open the Supabase project used by the Vercel deployment.
2. Run `supabase/setup.sql` once if the base storefront schema has not already been installed. It creates the products, customer_profiles, orders and order_items tables and the guest checkout RPC.
3. Run `supabase/customer-accounts.sql` in the same project's SQL Editor. This adds Supabase Auth profile linking, profile row-level security, avatar storage policies and the authenticated order RPC.
4. In Supabase Authentication settings, configure the Site URL and redirect URLs for the local app and the production Vercel domain. Enable email/password sign-in.
5. In Vercel Project Settings → Environment Variables, set:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SECRET_KEY` (server-only service/secret key; never expose it with a NEXT_PUBLIC_ prefix)
6. Redeploy after changing environment variables.

The existing guest checkout continues to use the server-only secret key and `create_guest_order`. Signed-in checkout sends the user's Supabase access token and uses `create_account_order`, so those orders are linked to the signed-in customer's profile. Customer profile and order-history reads are protected by RLS.

## Customer accounts

The `/account` page supports email/password sign-up and sign-in, profile name, phone and delivery address, avatar uploads (JPG/PNG/WEBP up to 3 MB), order history and sign-out. Email verification may be required depending on the Supabase Auth setting.

## Product browsing

The collection data is cached for 60 seconds. Product-card plus buttons open a quick-view panel where customers select colour and size before adding the item to the bag.
