create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  doctor_name text not null,
  doctor_initials text not null,
  doctor_photo_url text,
  appointment_date date not null,
  appointment_time text not null,
  consultation_type text not null default 'Video Consultation',
  status text not null default 'booked' check (status in ('booked', 'completed', 'cancelled')),
  created_at timestamptz not null default now()
);
create index appointments_user_date_idx
  on public.appointments (user_id, appointment_date desc, created_at desc);
alter table public.appointments enable row level security;
revoke all on table public.appointments from anon, authenticated;
grant select, insert, update on table public.appointments to authenticated;
create policy "Users can read their own appointments"
on public.appointments for select to authenticated
using ((select auth.uid()) = user_id);
create policy "Users can book their own appointments"
on public.appointments for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "Users can update their own appointments"
on public.appointments for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
