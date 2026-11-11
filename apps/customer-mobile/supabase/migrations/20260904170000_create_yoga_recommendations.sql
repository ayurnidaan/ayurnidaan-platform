create table public.yoga_poses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  english_name text not null,
  category text not null,
  intensity text not null,
  pacifies text[] not null default '{}',
  may_aggravate text[] not null default '{}',
  qualities text[] not null default '{}',
  sort_order integer not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.yoga_poses enable row level security;
revoke all on table public.yoga_poses from anon, authenticated;
grant select on table public.yoga_poses to authenticated;
create policy "Authenticated users can read active yoga poses"
on public.yoga_poses for select to authenticated
using (active);

insert into public.yoga_poses (sort_order, name, english_name, category, intensity, pacifies, may_aggravate, qualities) values
  (1, 'Tadasana', 'Mountain Pose', 'Standing', 'Gentle', array['Vata','Kapha'], array[]::text[], array['Grounding','Stabilizing','Posture']),
  (2, 'Vrikshasana', 'Tree Pose', 'Balance', 'Gentle', array['Vata'], array[]::text[], array['Grounding','Balance','Focus']),
  (3, 'Trikonasana', 'Triangle Pose', 'Standing', 'Moderate', array['Kapha'], array['Vata'], array['Energizing','Opening','Mobility']),
  (4, 'Virabhadrasana I', 'Warrior I', 'Standing', 'Moderate', array['Kapha'], array['Pitta'], array['Strengthening','Energizing','Grounding']),
  (5, 'Virabhadrasana II', 'Warrior II', 'Standing', 'Moderate', array['Kapha'], array['Pitta'], array['Strengthening','Energizing','Stabilizing']),
  (6, 'Utkatasana', 'Chair Pose', 'Standing', 'Moderate', array['Kapha'], array['Pitta'], array['Energizing','Strengthening','Warming']),
  (7, 'Malasana', 'Garland Pose', 'Squat', 'Gentle', array['Vata'], array[]::text[], array['Grounding','Hip opening','Mobility']),
  (8, 'Adho Mukha Svanasana', 'Downward-Facing Dog', 'Inversion', 'Moderate', array['Kapha'], array['Vata'], array['Energizing','Stretching','Strengthening']),
  (9, 'Bhujangasana', 'Cobra Pose', 'Backbend', 'Gentle', array['Kapha'], array['Pitta'], array['Opening','Energizing','Strengthening']),
  (10, 'Salabhasana', 'Locust Pose', 'Backbend', 'Moderate', array['Kapha'], array['Pitta'], array['Strengthening','Energizing','Warming']),
  (11, 'Setu Bandhasana', 'Bridge Pose', 'Backbend', 'Gentle', array['Vata'], array[]::text[], array['Grounding','Opening','Calming']),
  (12, 'Marjaryasana-Bitilasana', 'Cat-Cow Pose', 'Mobility', 'Gentle', array['Vata'], array[]::text[], array['Gentle movement','Mobility','Warming']),
  (13, 'Balasana', 'Child''s Pose', 'Restorative', 'Gentle', array['Vata','Pitta'], array['Kapha'], array['Calming','Grounding','Restorative']),
  (14, 'Sukhasana', 'Easy Pose', 'Seated', 'Gentle', array['Vata','Pitta'], array[]::text[], array['Calming','Grounding','Meditative']),
  (15, 'Vajrasana', 'Thunderbolt Pose', 'Seated', 'Gentle', array['Vata'], array[]::text[], array['Grounding','Stable','Meditative']),
  (16, 'Baddha Konasana', 'Bound Angle Pose', 'Seated', 'Gentle', array['Vata','Pitta'], array[]::text[], array['Grounding','Hip opening','Calming']),
  (17, 'Paschimottanasana', 'Seated Forward Bend', 'Forward Bend', 'Gentle', array['Vata','Pitta'], array['Kapha'], array['Calming','Cooling','Grounding']),
  (18, 'Janu Sirsasana', 'Head-to-Knee Pose', 'Forward Bend', 'Gentle', array['Vata','Pitta'], array[]::text[], array['Calming','Grounding','Stretching']),
  (19, 'Ardha Matsyendrasana', 'Half Lord of the Fishes Pose', 'Twist', 'Moderate', array['Kapha'], array['Vata'], array['Twisting','Mobilizing','Stimulating']),
  (20, 'Supta Matsyendrasana', 'Supine Spinal Twist', 'Twist', 'Gentle', array['Vata','Pitta'], array[]::text[], array['Calming','Gentle movement','Grounding']),
  (21, 'Pavanamuktasana', 'Wind-Relieving Pose', 'Supine', 'Gentle', array['Vata'], array[]::text[], array['Grounding','Gentle compression','Relaxing']),
  (22, 'Apanasana', 'Knees-to-Chest Pose', 'Supine', 'Gentle', array['Vata'], array[]::text[], array['Grounding','Calming','Gentle compression']),
  (23, 'Ananda Balasana', 'Happy Baby Pose', 'Supine', 'Gentle', array['Vata','Pitta'], array[]::text[], array['Relaxing','Grounding','Hip opening']),
  (24, 'Viparita Karani', 'Legs-Up-the-Wall Pose', 'Restorative', 'Gentle', array['Vata','Pitta'], array['Kapha'], array['Restorative','Calming','Cooling']),
  (25, 'Supta Baddha Konasana', 'Reclining Bound Angle Pose', 'Restorative', 'Gentle', array['Vata','Pitta'], array['Kapha'], array['Restorative','Calming','Opening']),
  (26, 'Savasana', 'Corpse Pose', 'Restorative', 'Gentle', array['Vata','Pitta'], array['Kapha'], array['Deep relaxation','Grounding','Restorative']),
  (27, 'Surya Namaskar', 'Sun Salutation', 'Flow', 'Dynamic', array['Kapha'], array['Pitta','Vata'], array['Energizing','Warming','Dynamic']),
  (28, 'Uttanasana', 'Standing Forward Bend', 'Forward Bend', 'Gentle', array['Pitta'], array['Vata'], array['Calming','Stretching','Cooling']),
  (29, 'Parsvakonasana', 'Extended Side Angle Pose', 'Standing', 'Moderate', array['Kapha'], array['Pitta','Vata'], array['Energizing','Opening','Strengthening']),
  (30, 'Dhanurasana', 'Bow Pose', 'Backbend', 'Moderate', array['Kapha'], array['Pitta','Vata'], array['Stimulating','Warming','Energizing']),
  (31, 'Makarasana', 'Crocodile Pose', 'Restorative', 'Gentle', array['Vata','Pitta'], array['Kapha'], array['Relaxing','Grounding','Restorative']);

create table public.yoga_recommendation_plans (
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
  constraint yoga_recommendation_plan_is_object check (jsonb_typeof(plan) = 'object'),
  constraint yoga_recommendation_prakriti_is_object check (jsonb_typeof(prakriti) = 'object'),
  constraint yoga_recommendation_history_is_array check (jsonb_typeof(assessment_history) = 'array')
);

create index yoga_recommendation_plans_user_created_idx
  on public.yoga_recommendation_plans (user_id, created_at desc);

alter table public.yoga_recommendation_plans enable row level security;
revoke all on table public.yoga_recommendation_plans from anon, authenticated;
grant select, insert, update on table public.yoga_recommendation_plans to authenticated;

create policy "Users can read their own yoga plans"
on public.yoga_recommendation_plans for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create yoga plans for their own assessments"
on public.yoga_recommendation_plans for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.current_health_assessments assessment
    where assessment.id = current_health_assessment_id
      and assessment.user_id = (select auth.uid())
  )
);

create policy "Users can update their own yoga plans"
on public.yoga_recommendation_plans for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
