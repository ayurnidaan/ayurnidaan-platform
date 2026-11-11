create table public.current_health_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symptoms jsonb not null default '[]'::jsonb,
  lifestyle_summary text,
  sleep_summary text,
  stress_summary text,
  completed_at timestamptz not null default now()
);
create index current_health_assessments_user_completed_idx
  on public.current_health_assessments (user_id, completed_at desc);
alter table public.current_health_assessments enable row level security;
revoke all on table public.current_health_assessments from anon, authenticated;
grant select, insert on table public.current_health_assessments to authenticated;
create policy "Users can read their own Current Health assessments"
on public.current_health_assessments for select to authenticated
using ((select auth.uid()) = user_id);
create policy "Users can create their own Current Health assessments"
on public.current_health_assessments for insert to authenticated
with check ((select auth.uid()) = user_id);
