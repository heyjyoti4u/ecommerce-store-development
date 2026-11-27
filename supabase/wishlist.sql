-- ORO wishlist: run once in Supabase SQL Editor after customer-accounts.sql.
begin;

create table if not exists public.wishlist_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create index if not exists wishlist_items_user_created_idx
  on public.wishlist_items(user_id, created_at desc);

alter table public.wishlist_items enable row level security;
revoke all on public.wishlist_items from anon, authenticated;
grant select, insert, delete on public.wishlist_items to authenticated;

drop policy if exists "Customers can read own wishlist" on public.wishlist_items;
create policy "Customers can read own wishlist"
on public.wishlist_items for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Customers can add to own wishlist" on public.wishlist_items;
create policy "Customers can add to own wishlist"
on public.wishlist_items for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.products p where p.id = product_id and p.active = true)
);

drop policy if exists "Customers can remove from own wishlist" on public.wishlist_items;
create policy "Customers can remove from own wishlist"
on public.wishlist_items for delete to authenticated
using (user_id = (select auth.uid()));

commit;
