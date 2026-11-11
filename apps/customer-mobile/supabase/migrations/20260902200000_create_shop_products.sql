create table public.shop_products (
  id text primary key,
  name text not null,
  weight text not null,
  price integer not null check (price >= 0),
  mrp integer not null check (mrp >= price),
  icon text not null,
  categories text[] not null default '{}',
  tags text[] not null default '{}',
  description text not null,
  rating numeric(2, 1) not null check (rating between 0 and 5),
  rating_count integer not null default 0 check (rating_count >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.shop_products enable row level security;
revoke all on table public.shop_products from anon, authenticated;
grant select on table public.shop_products to authenticated;
create policy "Authenticated users can browse active shop products"
on public.shop_products for select to authenticated
using (active = true);
insert into public.shop_products
  (id, name, weight, price, mrp, icon, categories, tags, description, rating, rating_count, sort_order)
values
  ('ashwagandha', 'Ashwagandha', '500 mg · 60 tablets', 599, 785, '🌿', array['Herbal Products', 'Supplements'], array['recommended', 'best-seller', 'stress', 'energy', 'sleep'], 'Supports stress relief, sustained energy, restful sleep, and overall wellness.', 4.7, 920, 1),
  ('triphala', 'Triphala', '500 mg · 60 tablets', 499, 650, '🍃', array['Supplements', 'Herbal Products'], array['best-seller', 'previously-ordered', 'digestion', 'daily-wellness'], 'A traditional Ayurvedic blend formulated to support digestion and daily wellbeing.', 4.6, 540, 2),
  ('chyawanprash', 'Chyawanprash', '500 g', 449, 575, '🍯', array['Health Food'], array['recommended', 'best-seller', 'immunity', 'strength'], 'A nourishing herbal formulation to support immunity, strength, and vitality.', 4.8, 760, 3),
  ('massage-oil', 'Abhyanga Oil', '200 ml', 349, 425, '🧴', array['Personal Care'], array['recommended', 'previously-ordered', 'massage', 'relaxation'], 'A warming herbal massage oil for a calming and restorative self-care ritual.', 4.5, 310, 4);
