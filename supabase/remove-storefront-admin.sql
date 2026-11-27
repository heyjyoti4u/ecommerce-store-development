-- ORO storefront: remove admin dashboard permissions.
-- Apply after the previously used admin-access.sql and order-lifecycle.sql migrations.
begin;
drop policy if exists "Admins can manage products" on public.products;
drop policy if exists "Admins can read all customer profiles" on public.customer_profiles;
drop policy if exists "Admins can read all orders" on public.orders;
drop policy if exists "Admins can update orders" on public.orders;
drop policy if exists "Admins can read all order items" on public.order_items;
drop policy if exists "Admins can update order status" on public.orders;
drop policy if exists "Admins can manage product inventory" on public.product_inventory;
drop policy if exists "Customers and admins can read order status history" on public.order_status_history;
create policy "Customers can read own order status history"
  on public.order_status_history for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      join public.customer_profiles p on p.id = o.customer_id
      where o.id = order_status_history.order_id
        and p.user_id = (select auth.uid())
    )
  );
revoke insert, update, delete on public.products from authenticated;
revoke select on public.customer_profiles, public.orders, public.order_items from authenticated;
revoke update on public.orders from authenticated;
revoke all on public.product_inventory from authenticated;
revoke all on public.admin_users from anon, authenticated;
drop table if exists public.admin_users;
commit;
