-- ORO storefront: run this once in the Supabase SQL editor for the project
-- connected to this Vercel app. Product prices and order totals are in INR.
begin;

create table if not exists public.products (
  id text primary key,
  name text not null,
  category text not null check (category in ('Clothing', 'Bags', 'Accessories')),
  price numeric(10,2) not null check (price >= 0),
  old_price numeric(10,2) check (old_price is null or old_price >= price),
  image text not null,
  variant_images jsonb not null default '{}'::jsonb,
  alt text not null,
  description text not null,
  sizes jsonb not null default '["One size"]'::jsonb,
  colors jsonb not null default '["Natural"]'::jsonb,
  badge text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.products add column if not exists variant_images jsonb not null default '{}'::jsonb;

create table if not exists public.customer_profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  full_name text not null,
  phone text not null,
  address text not null,
  city text not null,
  state text not null,
  postal_code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('ORO-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  customer_id uuid not null references public.customer_profiles(id),
  subtotal numeric(10,2) not null check (subtotal >= 0),
  shipping numeric(10,2) not null check (shipping >= 0),
  total numeric(10,2) not null check (total = subtotal + shipping),
  currency text not null default 'INR' check (currency = 'INR'),
  payment_method text not null default 'cod' check (payment_method = 'cod'),
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'refunded')),
  status text not null default 'confirmed' check (status in ('confirmed', 'processing', 'shipped', 'delivered', 'cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text not null references public.products(id),
  product_name text not null,
  unit_price numeric(10,2) not null check (unit_price >= 0),
  size text not null,
  color text not null,
  quantity integer not null check (quantity between 1 and 10),
  line_total numeric(10,2) not null check (line_total = unit_price * quantity)
);

alter table public.products enable row level security;
alter table public.customer_profiles enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
revoke all on public.products, public.customer_profiles, public.orders, public.order_items from anon, authenticated;
grant select on public.products to anon, authenticated;
create policy "Anyone can view active ORO products" on public.products for select to anon, authenticated using (active);
grant all on public.products, public.customer_profiles, public.orders, public.order_items to service_role;

create or replace function public.create_guest_order(p_customer jsonb, p_items jsonb, p_payment_method text default 'cod')
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
begin
  if p_payment_method <> 'cod' then raise exception 'Unsupported payment method'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then raise exception 'Invalid order items'; end if;
  if length(trim(coalesce(p_customer->>'name', ''))) < 2
    or length(trim(coalesce(p_customer->>'address', ''))) < 5
    or length(trim(coalesce(p_customer->>'city', ''))) < 2
    or length(trim(coalesce(p_customer->>'state', ''))) < 2
    or (p_customer->>'email') !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or (p_customer->>'phone') !~ '^[6-9][0-9]{9}$'
    or (p_customer->>'postal') !~ '^[0-9]{6}$' then
    raise exception 'Invalid customer details';
  end if;

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

  insert into public.customer_profiles(email, full_name, phone, address, city, state, postal_code, updated_at)
  values (lower(trim(p_customer->>'email')), trim(p_customer->>'name'), regexp_replace(p_customer->>'phone', '\D', '', 'g'), trim(p_customer->>'address'), trim(p_customer->>'city'), trim(p_customer->>'state'), trim(p_customer->>'postal'), now())
  on conflict (email) do update set full_name = excluded.full_name, phone = excluded.phone, address = excluded.address, city = excluded.city, state = excluded.state, postal_code = excluded.postal_code, updated_at = now()
  returning id into v_customer_id;

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
revoke all on function public.create_guest_order(jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.create_guest_order(jsonb, jsonb, text) to service_role;

insert into public.products (id, name, category, price, old_price, image, alt, description, sizes, colors, badge) values
('linen-day-dress', 'The Linen Day Dress', 'Clothing', 4290, 5490, '/product-linen-dress.png', 'Ivory linen dress on a sunlit studio model', 'A softly structured, breathable linen dress made for long lunches and the in-between hours. Finished with an easy waist and deep pockets.', '["XS","S","M","L","XL"]', '["Oat","Ink"]', 'Bestseller'),
('everyday-carryall', 'The Everyday Carryall', 'Bags', 3890, 4500, '/product-carryall.png', 'Soft tan leather everyday carryall bag', 'Your considered everyday companion. A roomy, softly structured carryall with an interior pocket and adjustable strap.', '["One size"]', '["Cognac","Black"]', 'Just landed'),
('soft-structure-shirt', 'Soft Structure Shirt', 'Clothing', 2990, 3600, '/product-poplin-shirt.png', 'Relaxed white cotton shirt with a soft drape', 'An easy, oversized cotton poplin shirt with a curved hem and just-right drape. Wear it tucked, open, or on its own.', '["XS","S","M","L","XL"]', '["Cloud","Sage"]', null),
('sculpted-hoops', 'Sculpted Hoops', 'Accessories', 1490, 1890, '/product-gold-hoops.png', 'Sculptural gold hoops styled with a clean neutral look', 'Sculptural, lightweight hoops with a polished finish. The small detail that makes every day feel a little more put together.', '["One size"]', '["Gold","Silver"]', 'A little extra'),
('weekend-knit', 'The Weekend Knit', 'Clothing', 3590, 4290, 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=1100&q=85', 'Soft textured knit sweater in a muted natural color', 'A soft, breathable layer in a relaxed fit. Light enough for a sunlit morning, considered enough for every plan after.', '["XS","S","M","L"]', '["Butter","Moss"]', null),
('weekender-tote', 'The Weekender Tote', 'Bags', 3290, 3990, 'https://images.unsplash.com/photo-1591561954557-26941169b49e?auto=format&fit=crop&w=1100&q=85', 'Natural canvas tote bag for a weekend away', 'A durable, generous tote designed to move with you, from farmers market mornings to a spontaneous overnight.', '["One size"]', '["Natural","Espresso"]', null),
('fine-chain-necklace', 'Fine Chain Necklace', 'Accessories', 1690, 2190, 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=1100&q=85', 'Delicate fine gold chain necklace', 'A delicate everyday chain with an understated pendant. Designed for layering, lovely worn alone.', '["One size"]', '["Gold"]', null),
('cotton-everyday-trouser', 'Everyday Cotton Trouser', 'Clothing', 3490, 4290, 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?auto=format&fit=crop&w=1100&q=85', 'Relaxed straight-leg trousers in a warm neutral shade', 'Relaxed, high-rise trousers cut in soft cotton twill. A forever pair for slow days and full calendars alike.', '["XS","S","M","L","XL"]', '["Stone","Ink"]', null)
on conflict (id) do nothing;

update public.products set variant_images = jsonb_build_object(
  'Oat', jsonb_build_array('/product-linen-dress.png', '/product-linen-dress-alt.png'),
  'Ink', jsonb_build_array('/product-linen-dress-alt.png', '/product-linen-dress.png')
) where id = 'linen-day-dress' and variant_images = '{}'::jsonb;
update public.products set variant_images = jsonb_build_object(
  'Cognac', jsonb_build_array('/product-carryall.png', '/product-carryall-alt.png'),
  'Black', jsonb_build_array('/product-carryall-alt.png', '/product-carryall.png')
) where id = 'everyday-carryall' and variant_images = '{}'::jsonb;
update public.products set variant_images = jsonb_build_object(
  'Cloud', jsonb_build_array('/product-poplin-shirt.png', '/product-poplin-shirt-alt.png'),
  'Sage', jsonb_build_array('/product-poplin-shirt-alt.png', '/product-poplin-shirt.png')
) where id = 'soft-structure-shirt' and variant_images = '{}'::jsonb;
update public.products set variant_images = jsonb_build_object(
  'Gold', jsonb_build_array('/product-gold-hoops.png', '/product-gold-hoops-alt.png'),
  'Silver', jsonb_build_array('/product-gold-hoops-alt.png', '/product-gold-hoops.png')
) where id = 'sculpted-hoops' and variant_images = '{}'::jsonb;

commit;
