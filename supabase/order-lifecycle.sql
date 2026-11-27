-- ORO order lifecycle and Stripe UPI migration.
-- Apply after setup.sql, customer-accounts.sql, and admin-access.sql in Supabase SQL Editor.
-- This migration is not applied automatically by the app.
begin;

alter table public.orders
  add column if not exists idempotency_key uuid,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists tracking_number text,
  add column if not exists courier_partner text,
  add column if not exists cod_confirmed_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists refund_id text,
  add column if not exists stock_deducted boolean not null default false;

alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check check (payment_method in ('cod', 'upi'));
alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.orders add constraint orders_payment_status_check check (payment_status in ('pending', 'paid', 'failed', 'refund_pending', 'refunded'));
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (status in ('pending_payment', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'));

create unique index if not exists orders_customer_idempotency_key_idx
  on public.orders(customer_id, idempotency_key) where idempotency_key is not null;
create unique index if not exists orders_stripe_checkout_session_idx
  on public.orders(stripe_checkout_session_id) where stripe_checkout_session_id is not null;
create unique index if not exists orders_stripe_payment_intent_idx
  on public.orders(stripe_payment_intent_id) where stripe_payment_intent_id is not null;
create unique index if not exists orders_refund_id_idx
  on public.orders(refund_id) where refund_id is not null;

-- Inventory is opt-in per variant: rows with a configured stock quantity are enforced;
-- variants without a row remain available until the future admin dashboard sets stock.
create table if not exists public.product_inventory (
  product_id text not null references public.products(id) on delete cascade,
  size text not null,
  color text not null,
  stock_on_hand integer not null check (stock_on_hand >= 0),
  updated_at timestamptz not null default now(),
  primary key (product_id, size, color)
);
alter table public.product_inventory enable row level security;
revoke all on public.product_inventory from anon, authenticated;
grant all on public.product_inventory to service_role;
grant select, insert, update, delete on public.product_inventory to authenticated;
drop policy if exists "Admins can manage product inventory" on public.product_inventory;
create policy "Admins can manage product inventory"
  on public.product_inventory for all to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

create table if not exists public.order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  old_status text,
  new_status text not null,
  note text,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists order_status_history_order_created_idx
  on public.order_status_history(order_id, created_at desc);
alter table public.order_status_history enable row level security;
revoke all on public.order_status_history from anon, authenticated;
grant select on public.order_status_history to authenticated;
grant all on public.order_status_history to service_role;
drop policy if exists "Customers and admins can read order status history" on public.order_status_history;
create policy "Customers and admins can read order status history"
  on public.order_status_history for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      join public.customer_profiles p on p.id = o.customer_id
      where o.id = order_status_history.order_id
        and p.user_id = (select auth.uid())
    )
    or exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()))
  );

create or replace function public.record_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_history(order_id, old_status, new_status, note, changed_by)
    values (new.id, null, new.status, 'Order placed', auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.order_status_history(order_id, old_status, new_status, note, changed_by)
    values (new.id, old.status, new.status, null, auth.uid());
  end if;
  return new;
end;
$$;
drop trigger if exists orders_record_status_change on public.orders;
create trigger orders_record_status_change
after insert or update of status on public.orders
for each row execute function public.record_order_status_change();

create or replace function public.create_account_order(
  p_user_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_order_id uuid;
  v_order_number text;
  v_subtotal numeric(10,2) := 0;
  v_shipping numeric(10,2);
  v_line record;
  v_product public.products%rowtype;
  v_stock_managed boolean := false;
  v_existing public.orders%rowtype;
begin
  if p_user_id is null or p_idempotency_key is null then raise exception 'Authentication and idempotency key required'; end if;
  if p_payment_method is null or p_payment_method not in ('cod', 'upi') then raise exception 'Unsupported payment method'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Invalid order items'; end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then raise exception 'Invalid order items'; end if;

  select id into v_customer_id
  from public.customer_profiles
  where user_id = p_user_id
    and length(trim(full_name)) >= 2
    and phone ~ '^[6-9][0-9]{9}$'
    and length(trim(address)) >= 5
    and length(trim(city)) >= 2
    and length(trim(state)) >= 2
    and postal_code ~ '^[0-9]{6}$';
  if v_customer_id is null then raise exception 'Complete your name, phone and delivery address before ordering'; end if;

  select * into v_existing from public.orders
  where customer_id = v_customer_id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('order_id', v_existing.id, 'order_number', v_existing.order_number, 'total', v_existing.total, 'currency', v_existing.currency, 'status', v_existing.status, 'payment_status', v_existing.payment_status);
  end if;

  for v_line in
    select x.product_id, x.size, x.color, sum(x.quantity)::integer as quantity
    from jsonb_to_recordset(p_items) as x(product_id text, size text, color text, quantity integer)
    group by x.product_id, x.size, x.color order by x.product_id, x.size, x.color
  loop
    if coalesce(v_line.product_id, '') = '' or coalesce(v_line.size, '') = '' or coalesce(v_line.color, '') = '' then raise exception 'Invalid product option'; end if;
    if v_line.quantity is null or v_line.quantity < 1 or v_line.quantity > 10 then raise exception 'Quantity limit exceeded'; end if;
    select * into v_product from public.products where id = v_line.product_id and active = true for update;
    if not found then raise exception 'Product unavailable'; end if;
    if (jsonb_array_length(v_product.sizes) > 0 and not (v_product.sizes ? v_line.size))
      or (jsonb_array_length(v_product.colors) > 0 and not (v_product.colors ? v_line.color)) then raise exception 'Invalid product option'; end if;
    v_subtotal := v_subtotal + (v_product.price * v_line.quantity);
  end loop;
  v_shipping := case when v_subtotal = 0 or v_subtotal >= 3000 then 0 else 150 end;
  if p_payment_method = 'upi' and v_subtotal + v_shipping > 100000 then raise exception 'UPI transaction limit exceeded'; end if;

  insert into public.orders(customer_id, subtotal, shipping, total, payment_method, payment_status, status, idempotency_key, cod_confirmed_at)
  values (v_customer_id, v_subtotal, v_shipping, v_subtotal + v_shipping, p_payment_method, 'pending', case when p_payment_method = 'upi' then 'pending_payment' else 'confirmed' end, p_idempotency_key, case when p_payment_method = 'cod' then now() else null end)
  returning id, order_number into v_order_id, v_order_number;

  for v_line in
    select x.product_id, x.size, x.color, sum(x.quantity)::integer as quantity
    from jsonb_to_recordset(p_items) as x(product_id text, size text, color text, quantity integer)
    group by x.product_id, x.size, x.color order by x.product_id, x.size, x.color
  loop
    select * into v_product from public.products where id = v_line.product_id and active = true;
    insert into public.order_items(order_id, product_id, product_name, unit_price, size, color, quantity, line_total)
    values (v_order_id, v_product.id, v_product.name, v_product.price, v_line.size, v_line.color, v_line.quantity, v_product.price * v_line.quantity);

    if exists (select 1 from public.product_inventory i where i.product_id = v_line.product_id and i.size = v_line.size and i.color = v_line.color) then
      update public.product_inventory
      set stock_on_hand = stock_on_hand - v_line.quantity, updated_at = now()
      where product_id = v_line.product_id and size = v_line.size and color = v_line.color and stock_on_hand >= v_line.quantity;
      if not found then raise exception 'Insufficient stock for %', v_product.name; end if;
      v_stock_managed := true;
    end if;
  end loop;
  update public.orders set stock_deducted = v_stock_managed where id = v_order_id;

  return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number, 'total', v_subtotal + v_shipping, 'currency', 'INR', 'status', case when p_payment_method = 'upi' then 'pending_payment' else 'confirmed' end, 'payment_status', 'pending');
end;
$$;

create table if not exists public.order_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  request_id uuid not null unique,
  attempt_number integer not null check (attempt_number > 0),
  stripe_session_id text unique,
  created_at timestamptz not null default now(),
  unique(order_id, attempt_number)
);
alter table public.order_payment_attempts enable row level security;
revoke all on public.order_payment_attempts from anon, authenticated;
grant all on public.order_payment_attempts to service_role;

create or replace function public.begin_account_payment(p_user_id uuid, p_order_id uuid, p_request_id uuid)
returns table(attempt_id uuid, attempt_number integer, stripe_session_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_order public.orders%rowtype;
  v_attempt public.order_payment_attempts%rowtype;
begin
  select id into v_customer_id from public.customer_profiles where user_id = p_user_id;
  if v_customer_id is null then raise exception 'Account profile not found'; end if;
  select * into v_order from public.orders where id = p_order_id and customer_id = v_customer_id for update;
  if not found or v_order.payment_method <> 'upi' or v_order.payment_status <> 'pending' or v_order.status <> 'pending_payment' then raise exception 'Order is not awaiting UPI payment'; end if;
  select * into v_attempt from public.order_payment_attempts where request_id = p_request_id;
  if found then
    if v_attempt.order_id <> p_order_id then raise exception 'Payment request key is already used'; end if;
    return query select v_attempt.id, v_attempt.attempt_number, v_attempt.stripe_session_id;
    return;
  end if;
  insert into public.order_payment_attempts(order_id, request_id, attempt_number)
  select p_order_id, p_request_id, coalesce(max(a.attempt_number), 0) + 1
  from public.order_payment_attempts a where a.order_id = p_order_id
  returning * into v_attempt;
  return query select v_attempt.id, v_attempt.attempt_number, v_attempt.stripe_session_id;
end;
$$;

create or replace function public.attach_account_payment_session(p_user_id uuid, p_order_id uuid, p_attempt_id uuid, p_session_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.orders o join public.customer_profiles p on p.id = o.customer_id
    where o.id = p_order_id and p.user_id = p_user_id and o.payment_method = 'upi' and o.payment_status = 'pending' and o.status = 'pending_payment'
  ) then raise exception 'Order is not awaiting payment'; end if;
  update public.order_payment_attempts set stripe_session_id = p_session_id
  where id = p_attempt_id and order_id = p_order_id;
  if not found then raise exception 'Payment attempt not found'; end if;
  update public.orders set stripe_checkout_session_id = p_session_id where id = p_order_id;
end;
$$;

create or replace function public.confirm_account_payment(p_user_id uuid, p_order_id uuid, p_attempt_id uuid, p_session_id text, p_payment_intent_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_customer_id uuid;
begin
  select id into v_customer_id from public.customer_profiles where user_id = p_user_id;
  select * into v_order from public.orders where id = p_order_id and customer_id = v_customer_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.payment_status = 'paid' and v_order.stripe_checkout_session_id = p_session_id then
    return jsonb_build_object('order_number', v_order.order_number, 'total', v_order.total, 'payment_status', v_order.payment_status);
  end if;
  if v_order.payment_method <> 'upi' or v_order.status <> 'pending_payment' or v_order.payment_status <> 'pending'
    or v_order.stripe_checkout_session_id <> p_session_id
    or not exists (select 1 from public.order_payment_attempts a where a.id = p_attempt_id and a.order_id = p_order_id and a.stripe_session_id = p_session_id) then
    raise exception 'Payment session does not match this order';
  end if;
  update public.orders set payment_status = 'paid', status = 'confirmed', stripe_payment_intent_id = p_payment_intent_id
  where id = p_order_id;
  return jsonb_build_object('order_number', v_order.order_number, 'total', v_order.total, 'payment_status', 'paid');
end;
$$;

create or replace function public.cancel_account_order(p_user_id uuid, p_order_id uuid, p_reason text, p_refund_id text default null, p_refund_status text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_order public.orders%rowtype;
begin
  select id into v_customer_id from public.customer_profiles where user_id = p_user_id;
  select * into v_order from public.orders where id = p_order_id and customer_id = v_customer_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status = 'cancelled' then
    return jsonb_build_object('order_number', v_order.order_number, 'status', 'cancelled', 'payment_status', v_order.payment_status);
  end if;
  if v_order.status not in ('pending_payment', 'confirmed', 'processing') then raise exception 'This order can no longer be cancelled online'; end if;
  if v_order.payment_status = 'paid' and (coalesce(p_refund_id, '') = '' or p_refund_status not in ('succeeded', 'pending')) then raise exception 'Refund confirmation is required'; end if;
  update public.orders
    set status = 'cancelled',
        payment_status = case when v_order.payment_status = 'paid' then case when p_refund_status = 'succeeded' then 'refunded' else 'refund_pending' end when v_order.payment_method = 'upi' then 'failed' else v_order.payment_status end,
        cancelled_at = now(), cancellation_reason = left(coalesce(nullif(trim(p_reason), ''), 'Customer requested cancellation'), 500), refund_id = p_refund_id
  where id = p_order_id;
  return jsonb_build_object('order_number', v_order.order_number, 'status', 'cancelled', 'payment_status', case when v_order.payment_status = 'paid' then case when p_refund_status = 'succeeded' then 'refunded' else 'refund_pending' end when v_order.payment_method = 'upi' then 'failed' else v_order.payment_status end);
end;
$$;

create or replace function public.restore_cancelled_order_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line record;
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' and old.stock_deducted then
    for v_line in select product_id, size, color, quantity from public.order_items where order_id = new.id loop
      update public.product_inventory
      set stock_on_hand = stock_on_hand + v_line.quantity, updated_at = now()
      where product_id = v_line.product_id and size = v_line.size and color = v_line.color;
    end loop;
    new.stock_deducted := false;
  end if;
  return new;
end;
$$;
drop trigger if exists orders_restore_cancelled_stock on public.orders;
create trigger orders_restore_cancelled_stock
before update of status on public.orders
for each row execute function public.restore_cancelled_order_stock();

-- The API verifies the customer's Supabase session before calling these service-only RPCs.
revoke all on function public.create_account_order(uuid, jsonb, text, uuid) from public, anon, authenticated;
revoke all on function public.begin_account_payment(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.attach_account_payment_session(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.confirm_account_payment(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.cancel_account_order(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.create_account_order(uuid, jsonb, text, uuid) to service_role;
grant execute on function public.begin_account_payment(uuid, uuid, uuid) to service_role;
grant execute on function public.attach_account_payment_session(uuid, uuid, uuid, text) to service_role;
grant execute on function public.confirm_account_payment(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.cancel_account_order(uuid, uuid, text, text, text) to service_role;
revoke all on function public.create_account_order(jsonb) from public, anon, authenticated;

grant update (status, payment_status, tracking_number, courier_partner, cod_confirmed_at) on public.orders to authenticated;

commit;
