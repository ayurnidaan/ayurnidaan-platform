create table public.prakriti_validation_test_takes (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null unique references public.prakriti_assessments(id) on delete cascade,
  reviewer_user_id uuid not null references auth.users(id) on delete cascade,
  reviewer_name text,
  reviewer_mobile text,
  vata_percentage smallint not null check (vata_percentage between 0 and 100),
  pitta_percentage smallint not null check (pitta_percentage between 0 and 100),
  kapha_percentage smallint not null check (kapha_percentage between 0 and 100),
  answers jsonb not null,
  accuracy_rating smallint not null check (accuracy_rating between 1 and 5),
  feedback text not null check (char_length(trim(feedback)) > 0),
  completed_at timestamptz not null default now(),
  constraint validation_test_take_percentages_total_100 check (
    vata_percentage + pitta_percentage + kapha_percentage = 100
  )
);

create index prakriti_validation_test_takes_reviewer_completed_idx
  on public.prakriti_validation_test_takes (reviewer_user_id, completed_at desc);

alter table public.prakriti_validation_test_takes enable row level security;
revoke all on table public.prakriti_validation_test_takes from anon, authenticated;
grant select, insert on table public.prakriti_validation_test_takes to authenticated;

create policy "Reviewers can read their own validation test takes"
on public.prakriti_validation_test_takes for select to authenticated
using ((select auth.uid()) = reviewer_user_id);

create policy "Reviewers can create their own validation test takes"
on public.prakriti_validation_test_takes for insert to authenticated
with check (
  (select auth.uid()) = reviewer_user_id
  and exists (
    select 1 from public.prakriti_assessments assessment
    where assessment.id = assessment_id
      and assessment.user_id = (select auth.uid())
  )
);
