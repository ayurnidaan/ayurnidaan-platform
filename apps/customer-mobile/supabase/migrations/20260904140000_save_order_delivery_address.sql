alter table public.shop_orders
  add column delivery_address_id uuid references public.user_addresses(id) on delete set null,
  add column delivery_address_label text,
  add column delivery_address_snapshot text;

