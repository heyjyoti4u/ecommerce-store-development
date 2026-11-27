-- ORO Admin Dashboard staff access for the existing storefront Supabase project.
-- Run AFTER setup.sql, customer-accounts.sql, order-lifecycle.sql and razorpay-integration.sql.
-- Safe to run once; does not reset products, orders, customers or payments.

begin;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('owner','admin','staff')),
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
revoke all on public.admin_users from public, anon, authenticated;

-- Dashboard's product image bucket. Existing storefront product image URLs continue working.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('product-images','product-images',true,8388608,array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update set public=true,file_size_limit=8388608,allowed_mime_types=array['image/jpeg','image/png','image/webp','image/avif'];

drop policy if exists "Public can view ORO product images" on storage.objects;
create policy "Public can view ORO product images"
on storage.objects for select to public using (bucket_id='product-images');

drop policy if exists "ORO staff can upload product images" on storage.objects;
create policy "ORO staff can upload product images"
on storage.objects for insert to authenticated
with check (bucket_id='product-images' and exists (select 1 from public.admin_users a where a.user_id=(select auth.uid())));

drop policy if exists "ORO staff can update product images" on storage.objects;
create policy "ORO staff can update product images"
on storage.objects for update to authenticated
using (bucket_id='product-images' and exists (select 1 from public.admin_users a where a.user_id=(select auth.uid())))
with check (bucket_id='product-images' and exists (select 1 from public.admin_users a where a.user_id=(select auth.uid())));

drop policy if exists "ORO staff can delete product images" on storage.objects;
create policy "ORO staff can delete product images"
on storage.objects for delete to authenticated
using (bucket_id='product-images' and exists (select 1 from public.admin_users a where a.user_id=(select auth.uid())));

commit;
