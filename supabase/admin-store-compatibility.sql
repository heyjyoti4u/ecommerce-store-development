-- ORO storefront compatibility notes / additive columns only.
-- Run ONLY if dashboard development needs order dispatch dates.
begin;
alter table public.orders
  add column if not exists accepted_at timestamptz,
  add column if not exists processing_at timestamptz,
  add column if not exists shipped_at timestamptz,
  add column if not exists delivered_at timestamptz;
commit;
