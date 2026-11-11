create table public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  total_amount integer not null check (total_amount >= 0),
  status text not null default 'placed' check (status in ('placed', 'packed', 'shipped', 'delivered', 'cancelled')),
  delivery_postcode text,
  created_at timestamptz not null default now()
);

create table public.shop_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.shop_orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null references public.shop_products(id),
  quantity integer not null check (quantity > 0),
  unit_price integer not null check (unit_price >= 0)
);

create index shop_orders_user_created_idx on public.shop_orders (user_id, created_at desc);
create index shop_order_items_user_product_idx on public.shop_order_items (user_id, product_id);

alter table public.shop_orders enable row level security;
alter table public.shop_order_items enable row level security;

grant select, insert on table public.shop_orders to authenticated;
grant select, insert on table public.shop_order_items to authenticated;

create policy "Users can read their own shop orders" on public.shop_orders
for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can place their own shop orders" on public.shop_orders
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can read their own shop order items" on public.shop_order_items
for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can create their own shop order items" on public.shop_order_items
for insert to authenticated with check (
  (select auth.uid()) = user_id
  and exists (select 1 from public.shop_orders where id = order_id and user_id = (select auth.uid()))
);

update public.shop_products set tags = array_remove(tags, 'previously-ordered');
