alter table public.profiles
  add column if not exists mobile_number text;

create table public.assessment_reviews (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null unique references public.prakriti_assessments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  accuracy_rating smallint not null check (accuracy_rating between 1 and 5),
  feedback text not null check (char_length(trim(feedback)) > 0),
  created_at timestamptz not null default now()
);

create index assessment_reviews_user_created_idx
  on public.assessment_reviews (user_id, created_at desc);

alter table public.assessment_reviews enable row level security;
revoke all on table public.assessment_reviews from anon, authenticated;
grant select, insert on table public.assessment_reviews to authenticated;

create policy "Users can read their own assessment reviews"
on public.assessment_reviews for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own assessment reviews"
on public.assessment_reviews for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.prakriti_assessments assessment
    where assessment.id = assessment_id
      and assessment.user_id = (select auth.uid())
  )
);
