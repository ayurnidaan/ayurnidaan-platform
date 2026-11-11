alter table public.profiles
  add column avatar_url text,
  add column notifications_enabled boolean not null default true,
  add column diet_preference text check (diet_preference in ('vegetarian', 'non-vegetarian', 'vegan', 'pescatarian')),
  add column health_personalisation boolean not null default true,
  add column ai_context_enabled boolean not null default false,
  add column doctor_sharing_enabled boolean not null default false;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy "Users can upload their own avatar"
on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users can update their own avatar"
on storage.objects for update to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users can read their own avatar"
on storage.objects for select to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
