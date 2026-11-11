create sequence if not exists public.doctor_application_reference_seq
  start with 1184
  increment by 1;
create table if not exists public.doctor_applications (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null unique default (
    'AYN-' || to_char(current_date, 'YYYY') || '-' ||
    lpad(nextval('public.doctor_application_reference_seq')::text, 4, '0')
  ),
  mobile_number text,
  full_name text not null,
  age smallint not null check (age between 18 and 100),
  specialisations text[] not null check (cardinality(specialisations) > 0),
  aadhaar_number text not null check (aadhaar_number ~ '^[0-9]{12}$'),
  pan_number text not null check (pan_number ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  degree_document_provided boolean not null default false,
  aadhaar_document_provided boolean not null default false,
  pan_document_provided boolean not null default false,
  degree_document_path text,
  aadhaar_document_path text,
  pan_document_path text,
  consent_accepted_at timestamptz not null,
  status text not null default 'submitted'
    check (status in ('submitted', 'under_review', 'verified', 'rejected')),
  review_notes text,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists doctor_applications_active_aadhaar_idx
  on public.doctor_applications (aadhaar_number)
  where status in ('submitted', 'under_review', 'verified');
create unique index if not exists doctor_applications_active_pan_idx
  on public.doctor_applications (pan_number)
  where status in ('submitted', 'under_review', 'verified');
create table if not exists public.verified_doctors (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.doctor_applications(id) on delete restrict,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null,
  specialisations text[] not null default '{}',
  qualification text not null default 'BAMS',
  registration_number text,
  focus_areas text[] not null default '{}',
  experience_years smallint check (experience_years is null or experience_years >= 0),
  about text,
  consultation_fee numeric(10, 2) check (consultation_fee is null or consultation_fee >= 0),
  rating numeric(2, 1) not null default 0 check (rating between 0 and 5),
  rating_count integer not null default 0 check (rating_count >= 0),
  photo_url text,
  is_active boolean not null default true,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.doctor_applications enable row level security;
alter table public.verified_doctors enable row level security;
revoke all on table public.doctor_applications from anon, authenticated;
revoke all on table public.verified_doctors from anon, authenticated;
grant select on table public.verified_doctors to anon, authenticated;
create policy "Active verified doctors are publicly readable"
  on public.verified_doctors
  for select
  to anon, authenticated
  using (is_active = true);
create or replace function public.touch_doctor_record_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger touch_doctor_applications_updated_at
  before update on public.doctor_applications
  for each row execute function public.touch_doctor_record_updated_at();
create trigger touch_verified_doctors_updated_at
  before update on public.verified_doctors
  for each row execute function public.touch_doctor_record_updated_at();
create or replace function public.sync_verified_doctor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'verified' then
    new.reviewed_at = coalesce(new.reviewed_at, now());

    insert into public.verified_doctors (
      application_id,
      full_name,
      specialisations,
      is_active,
      verified_at
    ) values (
      new.id,
      new.full_name,
      new.specialisations,
      true,
      new.reviewed_at
    )
    on conflict (application_id) do update set
      full_name = excluded.full_name,
      specialisations = excluded.specialisations,
      is_active = true,
      verified_at = excluded.verified_at,
      updated_at = now();
  elsif old.status = 'verified' and new.status <> 'verified' then
    update public.verified_doctors
      set is_active = false, updated_at = now()
      where application_id = new.id;
  elsif new.status = 'rejected' then
    new.reviewed_at = coalesce(new.reviewed_at, now());
  end if;

  return new;
end;
$$;
create trigger sync_verified_doctor_after_review
  before update of status on public.doctor_applications
  for each row
  when (old.status is distinct from new.status)
  execute function public.sync_verified_doctor();
create or replace function public.submit_doctor_application(
  p_mobile_number text,
  p_full_name text,
  p_age integer,
  p_specialisations text[],
  p_aadhaar_number text,
  p_pan_number text,
  p_degree_document_provided boolean,
  p_aadhaar_document_provided boolean,
  p_pan_document_provided boolean,
  p_consent_accepted boolean
)
returns table (application_id uuid, reference_code text, submitted_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_application public.doctor_applications%rowtype;
  cleaned_mobile text := nullif(regexp_replace(coalesce(p_mobile_number, ''), '[^0-9]', '', 'g'), '');
  cleaned_name text := btrim(coalesce(p_full_name, ''));
  cleaned_aadhaar text := regexp_replace(coalesce(p_aadhaar_number, ''), '[^0-9]', '', 'g');
  cleaned_pan text := upper(btrim(coalesce(p_pan_number, '')));
begin
  if cleaned_name = '' or char_length(cleaned_name) > 120 then
    raise exception 'Enter a valid full name';
  end if;

  if p_age is null or p_age < 18 or p_age > 100 then
    raise exception 'Age must be between 18 and 100';
  end if;

  if p_specialisations is null or cardinality(p_specialisations) = 0 then
    raise exception 'Select at least one specialisation';
  end if;

  if cleaned_mobile is not null and cleaned_mobile !~ '^[0-9]{10}$' then
    raise exception 'Enter a valid 10 digit mobile number';
  end if;

  if cleaned_aadhaar !~ '^[0-9]{12}$' then
    raise exception 'Enter a valid 12 digit Aadhaar number';
  end if;

  if cleaned_pan !~ '^[A-Z]{5}[0-9]{4}[A-Z]$' then
    raise exception 'Enter a valid PAN number';
  end if;

  if not coalesce(p_degree_document_provided, false)
     or not coalesce(p_aadhaar_document_provided, false)
     or not coalesce(p_pan_document_provided, false) then
    raise exception 'All required documents must be provided';
  end if;

  if not coalesce(p_consent_accepted, false) then
    raise exception 'Verification consent is required';
  end if;

  insert into public.doctor_applications (
    mobile_number,
    full_name,
    age,
    specialisations,
    aadhaar_number,
    pan_number,
    degree_document_provided,
    aadhaar_document_provided,
    pan_document_provided,
    consent_accepted_at
  ) values (
    cleaned_mobile,
    cleaned_name,
    p_age,
    p_specialisations,
    cleaned_aadhaar,
    cleaned_pan,
    true,
    true,
    true,
    now()
  ) returning * into inserted_application;

  return query select
    inserted_application.id,
    inserted_application.reference_code,
    inserted_application.submitted_at;
exception
  when unique_violation then
    raise exception 'An active application already exists for these identity details';
end;
$$;
revoke all on function public.submit_doctor_application(
  text, text, integer, text[], text, text, boolean, boolean, boolean, boolean
) from public;
grant execute on function public.submit_doctor_application(
  text, text, integer, text[], text, text, boolean, boolean, boolean, boolean
) to anon, authenticated;
comment on table public.doctor_applications is
  'Private doctor verification submissions. Accessible only to trusted administrative roles.';
comment on table public.verified_doctors is
  'Public-safe profiles for doctors whose applications have been verified.';
comment on function public.submit_doctor_application is
  'Validated write-only entry point for doctor verification applications.';
