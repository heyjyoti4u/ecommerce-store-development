-- ORO admin access. Run in the Supabase SQL Editor for the same project as the storefront.
-- This migration assigns admin access only to the Supabase Auth UID below.
begin;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;
grant select on public.admin_users to authenticated;

drop policy if exists "Admins can read own admin record" on public.admin_users;
create policy "Admins can read own admin record"
  on public.admin_users for select to authenticated
  using (user_id = (select auth.uid()));

-- Admins can manage the product catalogue, read all orders and customer profiles, and update order status.
drop policy if exists "Admins can manage products" on public.products;
create policy "Admins can manage products" on public.products for all to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));
grant select, insert, update, delete on public.products to authenticated;
drop policy if exists "Admins can read all customer profiles" on public.customer_profiles;
create policy "Admins can read all customer profiles"
  on public.customer_profiles for select to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

drop policy if exists "Admins can read all orders" on public.orders;
create policy "Admins can read all orders"
  on public.orders for select to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

drop policy if exists "Admins can update orders" on public.orders;
create policy "Admins can update orders"
  on public.orders for update to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

drop policy if exists "Admins can read all order items" on public.order_items;
create policy "Admins can read all order items"
  on public.order_items for select to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

grant select on public.customer_profiles, public.orders, public.order_items to authenticated;
grant update (status, payment_status) on public.orders to authenticated;

-- The Auth UID is taken from the user row shown in Supabase Authentication > Users.
insert into public.admin_users (user_id, email)
select id, lower(email)
from auth.users
where id = 'e068bc5c-80d0-4d37-81b0-451550f0192b'::uuid
  and lower(email) = 'admin@gmail.com'
on conflict (user_id) do update set email = excluded.email;

do $$
begin
  if not exists (
    select 1 from public.admin_users
    where user_id = 'e068bc5c-80d0-4d37-81b0-451550f0192b'::uuid
      and lower(email) = 'admin@gmail.com'
  ) then
    raise exception 'Admin user not found. Check the Auth UID and email before running this migration.';
  end if;
end;
$$;

commit;
