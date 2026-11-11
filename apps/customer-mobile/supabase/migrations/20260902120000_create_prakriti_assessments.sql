create table public.prakriti_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vata_percentage smallint not null check (vata_percentage between 0 and 100),
  pitta_percentage smallint not null check (pitta_percentage between 0 and 100),
  kapha_percentage smallint not null check (kapha_percentage between 0 and 100),
  answers jsonb not null default '{}'::jsonb,
  question_count smallint not null check (question_count > 0),
  completed_at timestamptz not null default now(),
  constraint prakriti_percentages_total_100 check (
    vata_percentage + pitta_percentage + kapha_percentage = 100
  )
);
create index prakriti_assessments_user_completed_idx
  on public.prakriti_assessments (user_id, completed_at desc);
alter table public.prakriti_assessments enable row level security;
revoke all on table public.prakriti_assessments from anon, authenticated;
grant select, insert on table public.prakriti_assessments to authenticated;
create policy "Users can read their own Prakriti assessments"
on public.prakriti_assessments for select to authenticated
using ((select auth.uid()) = user_id);
create policy "Users can create their own Prakriti assessments"
on public.prakriti_assessments for insert to authenticated
with check ((select auth.uid()) = user_id);
