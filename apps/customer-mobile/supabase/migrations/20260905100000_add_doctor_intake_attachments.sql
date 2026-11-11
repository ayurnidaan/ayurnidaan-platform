alter table public.appointments
  add column if not exists patient_notes text,
  add column if not exists symptom_tags text[] not null default '{}',
  add column if not exists attachments jsonb not null default '[]'::jsonb;

alter table public.appointments
  drop constraint if exists appointments_attachments_is_array;

alter table public.appointments
  add constraint appointments_attachments_is_array
  check (jsonb_typeof(attachments) = 'array');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'doctor-intake-files',
  'doctor-intake-files',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "Users can upload their doctor intake files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'doctor-intake-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can read their doctor intake files"
on storage.objects for select to authenticated
using (
  bucket_id = 'doctor-intake-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can delete their doctor intake files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'doctor-intake-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
