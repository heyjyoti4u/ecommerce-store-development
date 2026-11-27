-- ORO storefront compatibility notes / additive columns only.
-- Run ONLY if dashboard development needs order dispatch dates.
begin;
alter table public.orders
  add column if not exists accepted_at timestamptz,
  add column if not exists processing_at timestamptz,
  add column if not exists shipped_at timestamptz,
  add column if not exists delivered_at timestamptz;
commit;


-- Extend the existing order status audit with employee identity and workflow dates.
alter table public.orders
  add column if not exists accepted_at timestamptz,
  add column if not exists processing_at timestamptz,
  add column if not exists shipped_at timestamptz,
  add column if not exists delivered_at timestamptz;

create or replace function public.record_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text;
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_history(order_id, old_status, new_status, note, changed_by)
    values (new.id, null, new.status, 'Order placed', auth.uid());
  elsif new.status is distinct from old.status then
    v_note := case new.status
      when 'confirmed' then 'Order accepted'
      when 'processing' then 'Order processing started'
      when 'shipped' then 'Order dispatched'
      when 'delivered' then 'Order delivered'
      when 'cancelled' then coalesce(new.cancellation_reason, 'Order cancelled')
      else null
    end;
    insert into public.order_status_history(order_id, old_status, new_status, note, changed_by)
    values (new.id, old.status, new.status, v_note, auth.uid());
    if new.status = 'confirmed' then new.accepted_at := coalesce(new.accepted_at, now()); end if;
    if new.status = 'processing' then new.processing_at := coalesce(new.processing_at, now()); end if;
    if new.status = 'shipped' then new.shipped_at := coalesce(new.shipped_at, now()); end if;
    if new.status = 'delivered' then new.delivered_at := coalesce(new.delivered_at, now()); end if;
  end if;
  return new;
end;
$$;
