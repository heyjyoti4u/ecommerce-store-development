begin;

alter table public.products
  add column if not exists variant_images jsonb not null default '{}'::jsonb;

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
