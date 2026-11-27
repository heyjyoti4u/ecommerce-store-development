-- ORO Razorpay migration.
-- Apply AFTER supabase/order-lifecycle.sql in the Supabase SQL Editor.
-- Keeps existing COD orders and historical Stripe references intact.

begin;

alter table public.orders
  add column if not exists razorpay_order_id text,
  add column if not exists razorpay_payment_id text;

alter table public.order_payment_attempts
  add column if not exists razorpay_order_id text;

create unique index if not exists orders_razorpay_order_id_idx
  on public.orders(razorpay_order_id) where razorpay_order_id is not null;
create unique index if not exists orders_razorpay_payment_id_idx
  on public.orders(razorpay_payment_id) where razorpay_payment_id is not null;
create unique index if not exists order_payment_attempts_razorpay_order_id_idx
  on public.order_payment_attempts(razorpay_order_id) where razorpay_order_id is not null;

drop function if exists public.begin_account_payment(uuid, uuid, uuid);
create function public.begin_account_payment(p_user_id uuid, p_order_id uuid, p_request_id uuid)
returns table(attempt_id uuid, attempt_number integer, razorpay_order_id text)
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
  if not found or v_order.payment_method <> 'upi' or v_order.payment_status <> 'pending' or v_order.status <> 'pending_payment' then
    raise exception 'Order is not awaiting online payment';
  end if;
  select * into v_attempt from public.order_payment_attempts where request_id = p_request_id;
  if found then
    if v_attempt.order_id <> p_order_id then raise exception 'Payment request key is already used'; end if;
    return query select v_attempt.id, v_attempt.attempt_number, v_attempt.razorpay_order_id;
    return;
  end if;
  insert into public.order_payment_attempts(order_id, request_id, attempt_number)
  select p_order_id, p_request_id, coalesce(max(a.attempt_number), 0) + 1
  from public.order_payment_attempts a where a.order_id = p_order_id
  returning * into v_attempt;
  return query select v_attempt.id, v_attempt.attempt_number, v_attempt.razorpay_order_id;
end;
$$;

create or replace function public.attach_account_payment_session(
  p_user_id uuid, p_order_id uuid, p_attempt_id uuid, p_session_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.orders o
    join public.customer_profiles p on p.id = o.customer_id
    where o.id = p_order_id and p.user_id = p_user_id
      and o.payment_method = 'upi' and o.payment_status = 'pending' and o.status = 'pending_payment'
  ) then raise exception 'Order is not awaiting payment'; end if;

  update public.order_payment_attempts
    set razorpay_order_id = p_session_id
    where id = p_attempt_id and order_id = p_order_id;
  if not found then raise exception 'Payment attempt not found'; end if;

  update public.orders set razorpay_order_id = p_session_id where id = p_order_id;
end;
$$;

create or replace function public.confirm_account_payment(
  p_user_id uuid, p_order_id uuid, p_attempt_id uuid,
  p_session_id text, p_payment_intent_id text
)
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

  if v_order.payment_status = 'paid'
    and v_order.razorpay_order_id = p_session_id
    and v_order.razorpay_payment_id = p_payment_intent_id then
    return jsonb_build_object('order_number', v_order.order_number, 'total', v_order.total, 'payment_status', v_order.payment_status);
  end if;

  if v_order.payment_method <> 'upi' or v_order.status <> 'pending_payment' or v_order.payment_status <> 'pending'
    or v_order.razorpay_order_id <> p_session_id
    or not exists (
      select 1 from public.order_payment_attempts a
      where a.id = p_attempt_id and a.order_id = p_order_id and a.razorpay_order_id = p_session_id
    ) then
    raise exception 'Payment reference does not match this order';
  end if;

  update public.orders
    set payment_status = 'paid', status = 'confirmed', razorpay_payment_id = p_payment_intent_id
    where id = p_order_id;
  return jsonb_build_object('order_number', v_order.order_number, 'total', v_order.total, 'payment_status', 'paid');
end;
$$;

revoke all on function public.begin_account_payment(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.attach_account_payment_session(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.confirm_account_payment(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.begin_account_payment(uuid, uuid, uuid) to service_role;
grant execute on function public.attach_account_payment_session(uuid, uuid, uuid, text) to service_role;
grant execute on function public.confirm_account_payment(uuid, uuid, uuid, text, text) to service_role;

commit;
