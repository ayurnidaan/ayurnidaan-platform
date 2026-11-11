create table public.vikriti_validation_test_takes (
  id uuid primary key default gen_random_uuid(),
  current_health_assessment_id uuid not null unique references public.current_health_assessments(id) on delete cascade,
  reviewer_user_id uuid not null references auth.users(id) on delete cascade,
  reviewer_name text,
  reviewer_mobile text,
  conclusion text not null,
  vata_imbalanced boolean not null,
  pitta_imbalanced boolean not null,
  kapha_imbalanced boolean not null,
  symptoms jsonb not null default '[]'::jsonb,
  reasoning text not null,
  conversation jsonb not null default '[]'::jsonb,
  accuracy_rating smallint not null check (accuracy_rating between 1 and 5),
  comments text not null check (char_length(trim(comments)) > 0),
  completed_at timestamptz not null default now(),
  constraint vikriti_validation_has_imbalance check (vata_imbalanced or pitta_imbalanced or kapha_imbalanced)
);

create index vikriti_validation_test_takes_reviewer_completed_idx
  on public.vikriti_validation_test_takes (reviewer_user_id, completed_at desc);

alter table public.vikriti_validation_test_takes enable row level security;
revoke all on table public.vikriti_validation_test_takes from anon, authenticated;
grant select, insert on table public.vikriti_validation_test_takes to authenticated;

create policy "Reviewers can read their own Vikriti validation test takes"
on public.vikriti_validation_test_takes for select to authenticated
using ((select auth.uid()) = reviewer_user_id);

create policy "Reviewers can create their own Vikriti validation test takes"
on public.vikriti_validation_test_takes for insert to authenticated
with check (
  (select auth.uid()) = reviewer_user_id
  and exists (
    select 1 from public.current_health_assessments assessment
    where assessment.id = current_health_assessment_id
      and assessment.user_id = (select auth.uid())
  )
);
