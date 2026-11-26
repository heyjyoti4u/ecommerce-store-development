-- ORO production compatibility migration.
-- Allows products with an intentionally empty sizes or colors JSON array.
-- Non-empty option arrays remain strictly validated against the live product row.
begin;

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
    if (jsonb_array_length(v_product.sizes) > 0 and not (v_product.sizes ? v_line.size)) or (jsonb_array_length(v_product.colors) > 0 and not (v_product.colors ? v_line.color)) then raise exception 'Invalid product option'; end if;
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
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select id into v_customer_id
  from public.customer_profiles
  where user_id = v_user_id
    and length(trim(full_name)) >= 2
    and phone ~ '^[6-9][0-9]{9}$'
    and length(trim(address)) >= 5
    and length(trim(city)) >= 2
    and length(trim(state)) >= 2
    and postal_code ~ '^[0-9]{6}$';

  if v_customer_id is null then
    raise exception 'Complete your name, phone and delivery address in your profile before ordering';
  end if;

  if jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 30 then
    raise exception 'Invalid order items';
  end if;

  for v_line in
    select x.product_id, x.size, x.color, sum(x.quantity)::integer as quantity
    from jsonb_to_recordset(p_items) as x(product_id text, size text, color text, quantity integer)
    group by x.product_id, x.size, x.color
  loop
    if v_line.quantity < 1 or v_line.quantity > 10 then
      raise exception 'Quantity limit exceeded';
    end if;
    select * into v_product
    from public.products
    where id = v_line.product_id and active = true;
    if not found then raise exception 'Product unavailable'; end if;
    if (jsonb_array_length(v_product.sizes) > 0 and not (v_product.sizes ? v_line.size)) or (jsonb_array_length(v_product.colors) > 0 and not (v_product.colors ? v_line.color)) then
      raise exception 'Invalid product option';
    end if;
    v_subtotal := v_subtotal + (v_product.price * v_line.quantity);
  end loop;

  v_shipping := case when v_subtotal = 0 or v_subtotal >= 3000 then 0 else 150 end;

  insert into public.orders (customer_id, subtotal, shipping, total, payment_method)
  values (v_customer_id, v_subtotal, v_shipping, v_subtotal + v_shipping, 'cod')
  returning id, order_number into v_order_id, v_order_number;

  for v_line in
    select x.product_id, x.size, x.color, sum(x.quantity)::integer as quantity
    from jsonb_to_recordset(p_items) as x(product_id text, size text, color text, quantity integer)
    group by x.product_id, x.size, x.color
  loop
    select * into v_product
    from public.products
    where id = v_line.product_id and active = true;

    insert into public.order_items
      (order_id, product_id, product_name, unit_price, size, color, quantity, line_total)
    values
      (v_order_id, v_product.id, v_product.name, v_product.price,
       v_line.size, v_line.color, v_line.quantity, v_product.price * v_line.quantity);
  end loop;

  return jsonb_build_object(
    'order_number', v_order_number,
    'total', v_subtotal + v_shipping,
    'currency', 'INR'
  );
end;
$$;

commit;
