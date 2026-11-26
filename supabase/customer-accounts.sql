-- ORO customer accounts: run after supabase/setup.sql in Supabase SQL Editor.
begin;

alter table public.customer_profiles
  add column if not exists user_id uuid unique references auth.users(id) on delete cascade,
  add column if not exists avatar_url text;

create index if not exists orders_customer_created_idx on public.orders(customer_id, created_at desc);
create index if not exists order_items_order_idx on public.order_items(order_id);

drop policy if exists "Customers can read own profile" on public.customer_profiles;
drop policy if exists "Customers can create own profile" on public.customer_profiles;
drop policy if exists "Customers can update own profile" on public.customer_profiles;
create policy "Customers can read own profile" on public.customer_profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Customers can create own profile" on public.customer_profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Customers can update own profile" on public.customer_profiles
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Customers can read own orders" on public.orders;
create policy "Customers can read own orders" on public.orders
  for select to authenticated using (
    exists (select 1 from public.customer_profiles p where p.id = orders.customer_id and p.user_id = (select auth.uid()))
  );

drop policy if exists "Customers can read own order items" on public.order_items;
create policy "Customers can read own order items" on public.order_items
  for select to authenticated using (
    exists (
      select 1 from public.orders o
      join public.customer_profiles p on p.id = o.customer_id
      where o.id = order_items.order_id and p.user_id = (select auth.uid())
    )
  );

grant select, insert, update on public.customer_profiles to authenticated;
grant select on public.orders, public.order_items to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "Users can upload own avatar" on storage.objects;
drop policy if exists "Users can update own avatar" on storage.objects;
drop policy if exists "Users can view avatars" on storage.objects;
create policy "Users can upload own avatar" on storage.objects
  for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users can update own avatar" on storage.objects
  for update to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users can view avatars" on storage.objects
  for select to public using (bucket_id = 'avatars');

create or replace function public.create_account_order(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_customer_id uuid;
  v_order_id uuid;
  v_order_number text;
  v_subtotal numeric(10,2) := 0;
  v_shipping numeric(10,2);
  v_line record;
  v_product public.products%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select id into v_customer_id from public.customer_profiles where user_id = v_user_id;
  if v_customer_id is null then raise exception 'Complete your customer profile before ordering'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then raise exception 'Invalid order items'; end if;

  for v_line in
    select x.product_id, x.size, x.color, sum(x.quantity)::integer as quantity
    from jsonb_to_recordset(p_items) as x(product_id text, size text, color text, quantity integer)
    group by x.product_id, x.size, x.color
  loop
    if v_line.quantity < 1 or v_line.quantity > 10 then raise exception 'Quantity limit exceeded'; end if;
    select * into v_product from public.products where id = v_line.product_id and active = true;
    if not found then raise exception 'Product unavailable'; end if;
    if not (v_product.sizes ? v_line.size) or not (v_product.colors ? v_line.color) then raise exception 'Invalid product option'; end if;
    v_subtotal := v_subtotal + (v_product.price * v_line.quantity);
  end loop;

  v_shipping := case when v_subtotal = 0 or v_subtotal >= 3000 then 0 else 150 end;
  insert into public.orders(customer_id, subtotal, shipping, total, payment_method)
  values (v_customer_id, v_subtotal, v_shipping, v_subtotal + v_shipping, 'cod')
  returning id, order_number into v_order_id, v_order_number;

  for v_line in
    select x.product_id, x.size, x.color, sum(x.quantity)::integer as quantity
    from jsonb_to_recordset(p_items) as x(product_id text, size text, color text, quantity integer)
    group by x.product_id, x.size, x.color
  loop
    select * into v_product from public.products where id = v_line.product_id and active = true;
    insert into public.order_items(order_id, product_id, product_name, unit_price, size, color, quantity, line_total)
    values (v_order_id, v_product.id, v_product.name, v_product.price, v_line.size, v_line.color, v_line.quantity, v_product.price * v_line.quantity);
  end loop;

  return jsonb_build_object('order_number', v_order_number, 'total', v_subtotal + v_shipping, 'currency', 'INR');
end;
$$;
revoke all on function public.create_account_order(jsonb) from public, anon;
grant execute on function public.create_account_order(jsonb) to authenticated;

commit;
