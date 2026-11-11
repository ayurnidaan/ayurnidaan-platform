create table public.food_intake_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  eaten_on date not null default current_date,
  meal text not null check (meal in ('morning', 'midday', 'evening', 'snack')),
  name text not null check (char_length(name) between 1 and 160),
  serving_label text,
  servings numeric(6,2) not null default 1 check (servings > 0 and servings <= 50),
  calories numeric(8,2) not null check (calories >= 0 and calories <= 10000),
  protein numeric(8,2) not null check (protein >= 0 and protein <= 1000),
  fat numeric(8,2) not null check (fat >= 0 and fat <= 1000),
  source text not null default 'manual' check (source in ('manual', 'scan')),
  created_at timestamptz not null default now()
);

create index food_intake_items_user_day_idx
  on public.food_intake_items (user_id, eaten_on, created_at);

alter table public.food_intake_items enable row level security;
revoke all on table public.food_intake_items from anon, authenticated;
grant select, insert, delete on table public.food_intake_items to authenticated;

create policy "Users can read their own food intake"
on public.food_intake_items for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own food intake"
on public.food_intake_items for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can remove their own food intake"
on public.food_intake_items for delete to authenticated
using ((select auth.uid()) = user_id);
