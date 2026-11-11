create table public.food_recommendation_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  current_health_assessment_id uuid not null unique references public.current_health_assessments(id) on delete cascade,
  prakriti jsonb not null,
  vikruti text not null,
  assessment_history jsonb not null default '[]'::jsonb,
  plan jsonb not null,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint food_recommendation_plan_is_object check (jsonb_typeof(plan) = 'object'),
  constraint food_recommendation_prakriti_is_object check (jsonb_typeof(prakriti) = 'object'),
  constraint food_recommendation_history_is_array check (jsonb_typeof(assessment_history) = 'array')
);

create index food_recommendation_plans_user_created_idx
  on public.food_recommendation_plans (user_id, created_at desc);

alter table public.food_recommendation_plans enable row level security;
revoke all on table public.food_recommendation_plans from anon, authenticated;
grant select, insert, update on table public.food_recommendation_plans to authenticated;

create policy "Users can read their own food plans"
on public.food_recommendation_plans for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create food plans for their own assessments"
on public.food_recommendation_plans for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.current_health_assessments assessment
    where assessment.id = current_health_assessment_id
      and assessment.user_id = (select auth.uid())
  )
);

create policy "Users can update their own food plans"
on public.food_recommendation_plans for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
