create table public.user_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Home',
  recipient_name text not null,
  address_line text not null,
  city text not null,
  state text not null,
  postcode text not null check (postcode ~ '^[0-9]{6}$'),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index user_addresses_user_idx on public.user_addresses (user_id, is_default desc, created_at desc);
alter table public.user_addresses enable row level security;
grant select, insert, update, delete on table public.user_addresses to authenticated;

create policy "Users can read their own addresses" on public.user_addresses for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can add their own addresses" on public.user_addresses for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update their own addresses" on public.user_addresses for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete their own addresses" on public.user_addresses for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Users can delete their own avatar"
on storage.objects for delete to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
