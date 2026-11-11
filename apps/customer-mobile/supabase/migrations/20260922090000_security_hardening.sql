-- Security hardening for paid resources, clinical data, consent evidence,
-- API abuse controls, and doctor identity submissions.

create extension if not exists pgcrypto with schema extensions;

-- Enforce the adult-only service boundary at the database layer as well as in
-- the application so a direct API request cannot bypass the age check.
create or replace function public.enforce_adult_profile()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.date_of_birth is not null and new.date_of_birth > (current_date - interval '18 years')::date then
    raise exception 'Ayurnidaan is currently available only to people aged 18 or older.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_require_adult on public.profiles;
create trigger profiles_require_adult
before insert or update of date_of_birth on public.profiles
for each row execute function public.enforce_adult_profile();

-- Paid resources are created only by the verified-payment service path.
revoke insert, update on table public.appointments from authenticated;
grant select on table public.appointments to authenticated;
drop policy if exists "Users can book their own appointments" on public.appointments;
drop policy if exists "Users can update their own appointments" on public.appointments;

alter table public.appointments
  add column if not exists verified_doctor_id uuid references public.verified_doctors(id) on delete restrict;
update public.appointments appointment
set verified_doctor_id = (
  select doctor.id
  from public.verified_doctors doctor
  where doctor.full_name = appointment.doctor_name
  order by doctor.is_active desc, doctor.verified_at desc
  limit 1
)
where appointment.verified_doctor_id is null;

revoke insert on table public.shop_orders from authenticated;
revoke insert on table public.shop_order_items from authenticated;
grant select on table public.shop_orders to authenticated;
grant select on table public.shop_order_items to authenticated;
drop policy if exists "Users can place their own shop orders" on public.shop_orders;
drop policy if exists "Users can create their own shop order items" on public.shop_order_items;

create unique index if not exists payment_transactions_resource_unique
  on public.payment_transactions (purpose, resource_id)
  where resource_id is not null;

-- Clinical content is doctor-authored and audited. Patients retain read access
-- through the existing appointment SELECT policy.
create table if not exists public.appointment_clinical_audit (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  doctor_user_id uuid not null references auth.users(id) on delete restrict,
  discussion_summary text,
  prescription text,
  recorded_at timestamptz not null default now()
);
alter table public.appointment_clinical_audit enable row level security;
revoke all on table public.appointment_clinical_audit from anon, authenticated;

create or replace function public.update_appointment_clinical_notes(
  p_appointment_id uuid,
  p_discussion_summary text,
  p_prescription text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target public.appointments%rowtype;
begin
  if caller_id is null then raise exception 'Authentication required'; end if;

  select * into target
  from public.appointments
  where id = p_appointment_id
  for update;

  if target.id is null then raise exception 'Appointment not found'; end if;
  if not exists (
    select 1 from public.verified_doctors doctor
    where doctor.auth_user_id = caller_id
      and doctor.is_active = true
      and doctor.id = target.verified_doctor_id
  ) then
    raise exception 'Doctor is not authorised for this appointment';
  end if;
  if target.status = 'cancelled' then raise exception 'Cancelled appointments cannot be completed'; end if;
  if target.appointment_date > current_date then raise exception 'Future appointments cannot be completed'; end if;

  update public.appointments
  set status = 'completed',
      discussion_summary = nullif(left(btrim(coalesce(p_discussion_summary, '')), 8000), ''),
      prescription = nullif(left(btrim(coalesce(p_prescription, '')), 8000), '')
  where id = p_appointment_id;

  insert into public.appointment_clinical_audit (
    appointment_id, doctor_user_id, discussion_summary, prescription
  ) values (
    p_appointment_id,
    caller_id,
    nullif(left(btrim(coalesce(p_discussion_summary, '')), 8000), ''),
    nullif(left(btrim(coalesce(p_prescription, '')), 8000), '')
  );
end;
$$;
revoke all on function public.update_appointment_clinical_notes(uuid, text, text) from public;
grant execute on function public.update_appointment_clinical_notes(uuid, text, text) to authenticated;

-- Atomically create exactly one resource for a verified captured payment.
create or replace function public.fulfil_verified_payment(
  p_transaction_id uuid,
  p_razorpay_payment_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment public.payment_transactions%rowtype;
  created_resource_id uuid;
  order_id uuid;
  item jsonb;
  attachment jsonb;
begin
  select * into payment
  from public.payment_transactions
  where id = p_transaction_id
  for update;

  if payment.id is null then raise exception 'Payment transaction not found'; end if;
  if payment.status = 'paid' and payment.resource_id is not null then return payment.resource_id; end if;
  if payment.status <> 'created' then raise exception 'Payment transaction cannot be fulfilled'; end if;
  if payment.razorpay_order_id is null then raise exception 'Payment order is incomplete'; end if;
  if nullif(btrim(coalesce(p_razorpay_payment_id, '')), '') is null then raise exception 'Payment ID is required'; end if;

  if payment.purpose = 'appointment' then
    if jsonb_array_length(coalesce(payment.payload -> 'attachments', '[]'::jsonb)) > 10 then
      raise exception 'Too many appointment attachments';
    end if;
    for attachment in select value from jsonb_array_elements(coalesce(payment.payload -> 'attachments', '[]'::jsonb)) loop
      if coalesce(attachment ->> 'storage_path', '') !~ ('^' || payment.user_id::text || '/')
         or not exists (
           select 1 from storage.objects object
           where object.bucket_id = 'doctor-intake-files'
             and object.name = attachment ->> 'storage_path'
             and split_part(object.name, '/', 1) = payment.user_id::text
         ) then
        raise exception 'Invalid appointment attachment';
      end if;
    end loop;

    insert into public.appointments (
      user_id, verified_doctor_id, doctor_name, doctor_initials, appointment_date, appointment_time,
      consultation_type, patient_notes, symptom_tags, attachments
    ) values (
      payment.user_id,
      (
        select doctor.id from public.verified_doctors doctor
        where doctor.full_name = payment.payload ->> 'doctor_name' and doctor.is_active = true
        order by doctor.verified_at desc limit 1
      ),
      left(payment.payload ->> 'doctor_name', 160),
      left(payment.payload ->> 'doctor_initials', 4),
      (payment.payload ->> 'appointment_date')::date,
      left(payment.payload ->> 'appointment_time', 20),
      payment.payload ->> 'consultation_type',
      nullif(left(payment.payload ->> 'patient_notes', 600), ''),
      array(select left(value, 80) from jsonb_array_elements_text(coalesce(payment.payload -> 'symptom_tags', '[]'::jsonb)) value),
      coalesce(payment.payload -> 'attachments', '[]'::jsonb)
    ) returning id into created_resource_id;
  elsif payment.purpose = 'shop' then
    insert into public.shop_orders (
      user_id, total_amount, delivery_postcode, delivery_address_id,
      delivery_address_label, delivery_address_snapshot
    ) values (
      payment.user_id,
      payment.amount_paise / 100,
      payment.payload #>> '{address,postcode}',
      (payment.payload #>> '{address,id}')::uuid,
      payment.payload #>> '{address,label}',
      concat_ws(E'\n',
        payment.payload #>> '{address,recipient_name}',
        payment.payload #>> '{address,address_line}',
        concat(payment.payload #>> '{address,city}', ', ', payment.payload #>> '{address,state}', ' ', payment.payload #>> '{address,postcode}')
      )
    ) returning id into order_id;

    for item in select value from jsonb_array_elements(payment.payload -> 'items') loop
      insert into public.shop_order_items (order_id, user_id, product_id, quantity, unit_price)
      values (
        order_id,
        payment.user_id,
        item ->> 'product_id',
        (item ->> 'quantity')::integer,
        (item ->> 'unit_price')::integer
      );
    end loop;
    created_resource_id := order_id;
  else
    raise exception 'Unsupported payment purpose';
  end if;

  update public.payment_transactions
  set status = 'paid',
      razorpay_payment_id = p_razorpay_payment_id,
      resource_id = created_resource_id,
      paid_at = now(),
      updated_at = now(),
      error_message = null
  where id = payment.id;

  return created_resource_id;
end;
$$;
revoke all on function public.fulfil_verified_payment(uuid, text) from public, anon, authenticated;
grant execute on function public.fulfil_verified_payment(uuid, text) to service_role;

-- Server-timestamped, versioned, append-only consent evidence.
create table if not exists public.consent_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null check (document_type in ('terms_privacy', 'personalisation', 'ai_context', 'doctor_sharing')),
  document_version text not null,
  document_sha256 text not null check (document_sha256 ~ '^[0-9a-f]{64}$'),
  action text not null check (action in ('accepted', 'withdrawn')),
  channel text not null check (channel in ('ios', 'android', 'web')),
  recorded_at timestamptz not null default now()
);
create index if not exists consent_events_user_recorded_idx on public.consent_events (user_id, recorded_at desc);
alter table public.consent_events enable row level security;
revoke all on table public.consent_events from anon, authenticated;
grant select on table public.consent_events to authenticated;
create policy "Users can read their own consent history"
on public.consent_events for select to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.record_consent(
  p_document_version text,
  p_document_sha256 text,
  p_personalisation boolean,
  p_ai_context boolean,
  p_doctor_sharing boolean,
  p_channel text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  recorded timestamptz := now();
begin
  if caller_id is null then raise exception 'Authentication required'; end if;
  if p_document_version <> '5.0'
     or p_document_sha256 <> '4641d907ce0e3eaf2ac34d763bb69244ed58076a2c1657f288777041ea17ffff'
     or p_channel not in ('ios', 'android', 'web') then
    raise exception 'Unsupported consent document';
  end if;

  insert into public.consent_events (user_id, document_type, document_version, document_sha256, action, channel, recorded_at)
  values
    (caller_id, 'terms_privacy', p_document_version, p_document_sha256, 'accepted', p_channel, recorded),
    (caller_id, 'personalisation', p_document_version, p_document_sha256, case when p_personalisation then 'accepted' else 'withdrawn' end, p_channel, recorded),
    (caller_id, 'ai_context', p_document_version, p_document_sha256, case when p_ai_context then 'accepted' else 'withdrawn' end, p_channel, recorded),
    (caller_id, 'doctor_sharing', p_document_version, p_document_sha256, case when p_doctor_sharing then 'accepted' else 'withdrawn' end, p_channel, recorded);

  insert into public.profiles (
    user_id, terms_accepted_at, profile_completed_at, health_personalisation,
    ai_context_enabled, doctor_sharing_enabled, updated_at
  ) values (
    caller_id, recorded, recorded, p_personalisation, p_ai_context, p_doctor_sharing, recorded
  ) on conflict (user_id) do update set
    terms_accepted_at = excluded.terms_accepted_at,
    profile_completed_at = excluded.profile_completed_at,
    health_personalisation = excluded.health_personalisation,
    ai_context_enabled = excluded.ai_context_enabled,
    doctor_sharing_enabled = excluded.doctor_sharing_enabled,
    updated_at = recorded;
end;
$$;
revoke all on function public.record_consent(text, text, boolean, boolean, boolean, text) from public;
grant execute on function public.record_consent(text, text, boolean, boolean, boolean, text) to authenticated;

create or replace function public.update_privacy_settings(
  p_notifications boolean,
  p_diet text,
  p_personalisation boolean,
  p_ai_context boolean,
  p_doctor_sharing boolean,
  p_document_version text,
  p_document_sha256 text,
  p_channel text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  recorded timestamptz := now();
begin
  if caller_id is null then raise exception 'Authentication required'; end if;
  if p_document_version <> '5.0'
     or p_document_sha256 <> '4641d907ce0e3eaf2ac34d763bb69244ed58076a2c1657f288777041ea17ffff'
     or p_channel not in ('ios', 'android', 'web')
     or p_diet not in ('vegetarian', 'non-vegetarian', 'vegan', 'pescatarian') then
    raise exception 'Invalid privacy settings';
  end if;

  insert into public.consent_events (user_id, document_type, document_version, document_sha256, action, channel, recorded_at)
  values
    (caller_id, 'personalisation', p_document_version, p_document_sha256, case when p_personalisation then 'accepted' else 'withdrawn' end, p_channel, recorded),
    (caller_id, 'ai_context', p_document_version, p_document_sha256, case when p_ai_context then 'accepted' else 'withdrawn' end, p_channel, recorded),
    (caller_id, 'doctor_sharing', p_document_version, p_document_sha256, case when p_doctor_sharing then 'accepted' else 'withdrawn' end, p_channel, recorded);

  update public.profiles
  set notifications_enabled = p_notifications,
      diet_preference = p_diet,
      health_personalisation = p_personalisation,
      ai_context_enabled = p_ai_context,
      doctor_sharing_enabled = p_doctor_sharing,
      updated_at = recorded
  where user_id = caller_id;

  if not found then raise exception 'Profile not found'; end if;
end;
$$;
revoke all on function public.update_privacy_settings(boolean, text, boolean, boolean, boolean, text, text, text) from public;
grant execute on function public.update_privacy_settings(boolean, text, boolean, boolean, boolean, text, text, text) to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant insert (user_id, full_name, mobile_number, date_of_birth, sex, height_cm, weight_kg)
  on public.profiles to authenticated;
grant update (
  full_name, mobile_number, date_of_birth, sex, height_cm, weight_kg, avatar_url,
  notifications_enabled, diet_preference, updated_at
) on public.profiles to authenticated;

-- Transaction-safe per-user API quotas shared by all Edge Function instances.
create table if not exists public.api_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0),
  primary key (user_id, endpoint)
);
alter table public.api_rate_limits enable row level security;
revoke all on table public.api_rate_limits from anon, authenticated;

create or replace function public.consume_api_rate_limit(
  p_endpoint text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  current_row public.api_rate_limits%rowtype;
begin
  if caller_id is null then raise exception 'Authentication required'; end if;
  if p_endpoint !~ '^[a-z0-9-]{1,80}$' or p_limit < 1 or p_limit > 10000 or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Invalid rate limit configuration';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller_id::text || ':' || p_endpoint, 0));
  select * into current_row from public.api_rate_limits
  where user_id = caller_id and endpoint = p_endpoint;

  if current_row.user_id is null or current_row.window_started_at <= now() - make_interval(secs => p_window_seconds) then
    insert into public.api_rate_limits (user_id, endpoint, window_started_at, request_count)
    values (caller_id, p_endpoint, now(), 1)
    on conflict (user_id, endpoint) do update
      set window_started_at = excluded.window_started_at, request_count = 1;
    return true;
  end if;

  if current_row.request_count >= p_limit then return false; end if;
  update public.api_rate_limits set request_count = request_count + 1
  where user_id = caller_id and endpoint = p_endpoint;
  return true;
end;
$$;
revoke all on function public.consume_api_rate_limit(text, integer, integer) from public;
grant execute on function public.consume_api_rate_limit(text, integer, integer) to authenticated;

-- Doctor verification submissions require an authenticated identity, real
-- uploaded documents, quotas, and non-reversible identity fingerprints.
create table if not exists public.doctor_identity_keys (
  key_id boolean primary key default true check (key_id),
  secret bytea not null default extensions.gen_random_bytes(32),
  created_at timestamptz not null default now()
);
alter table public.doctor_identity_keys enable row level security;
revoke all on table public.doctor_identity_keys from public, anon, authenticated;
insert into public.doctor_identity_keys (key_id) values (true) on conflict (key_id) do nothing;

create or replace function public.doctor_identity_fingerprint(p_value text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.encode(
    extensions.hmac(pg_catalog.convert_to(p_value, 'UTF8'), secret, 'sha256'),
    'hex'
  )
  from public.doctor_identity_keys
  where key_id = true
$$;
revoke all on function public.doctor_identity_fingerprint(text) from public, anon, authenticated;

alter table public.doctor_applications
  add column if not exists applicant_user_id uuid references auth.users(id) on delete set null,
  add column if not exists aadhaar_hash text,
  add column if not exists aadhaar_last_four text,
  add column if not exists pan_hash text,
  add column if not exists pan_last_four text;

update public.doctor_applications
set aadhaar_hash = coalesce(aadhaar_hash, public.doctor_identity_fingerprint(aadhaar_number)),
    aadhaar_last_four = coalesce(aadhaar_last_four, right(aadhaar_number, 4)),
    pan_hash = coalesce(pan_hash, public.doctor_identity_fingerprint(upper(pan_number))),
    pan_last_four = coalesce(pan_last_four, right(upper(pan_number), 4))
where aadhaar_number is not null or pan_number is not null;

drop index if exists public.doctor_applications_active_aadhaar_idx;
drop index if exists public.doctor_applications_active_pan_idx;
alter table public.doctor_applications alter column aadhaar_number drop not null;
alter table public.doctor_applications alter column pan_number drop not null;
update public.doctor_applications set aadhaar_number = null, pan_number = null;
create unique index if not exists doctor_applications_active_aadhaar_hash_idx
  on public.doctor_applications (aadhaar_hash)
  where status in ('submitted', 'under_review', 'verified') and aadhaar_hash is not null;
create unique index if not exists doctor_applications_active_pan_hash_idx
  on public.doctor_applications (pan_hash)
  where status in ('submitted', 'under_review', 'verified') and pan_hash is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'doctor-verification-files', 'doctor-verification-files', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Applicants can upload their verification files"
on storage.objects for insert to authenticated
with check (bucket_id = 'doctor-verification-files' and split_part(name, '/', 1) = (select auth.uid())::text);
create policy "Applicants can read their verification files"
on storage.objects for select to authenticated
using (bucket_id = 'doctor-verification-files' and split_part(name, '/', 1) = (select auth.uid())::text);
create policy "Applicants can delete their verification files"
on storage.objects for delete to authenticated
using (bucket_id = 'doctor-verification-files' and split_part(name, '/', 1) = (select auth.uid())::text);

drop function if exists public.submit_doctor_application(
  text, text, integer, text[], text, text, boolean, boolean, boolean, boolean
);

create function public.submit_doctor_application(
  p_mobile_number text,
  p_full_name text,
  p_age integer,
  p_specialisations text[],
  p_aadhaar_number text,
  p_pan_number text,
  p_degree_document_path text,
  p_aadhaar_document_path text,
  p_pan_document_path text,
  p_consent_accepted boolean
)
returns table (application_id uuid, reference_code text, submitted_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  inserted_application public.doctor_applications%rowtype;
  cleaned_mobile text := nullif(regexp_replace(coalesce(p_mobile_number, ''), '[^0-9]', '', 'g'), '');
  cleaned_name text := btrim(coalesce(p_full_name, ''));
  cleaned_aadhaar text := regexp_replace(coalesce(p_aadhaar_number, ''), '[^0-9]', '', 'g');
  cleaned_pan text := upper(btrim(coalesce(p_pan_number, '')));
  document_path text;
begin
  if caller_id is null then raise exception 'Authentication required'; end if;
  if not public.consume_api_rate_limit('doctor-application', 3, 86400) then raise exception 'Application limit reached'; end if;
  if cleaned_name = '' or char_length(cleaned_name) > 120 then raise exception 'Enter a valid full name'; end if;
  if p_age is null or p_age < 18 or p_age > 100 then raise exception 'Age must be between 18 and 100'; end if;
  if p_specialisations is null or cardinality(p_specialisations) = 0 or cardinality(p_specialisations) > 10 then raise exception 'Select valid specialisations'; end if;
  if cleaned_mobile is not null and cleaned_mobile !~ '^[0-9]{10}$' then raise exception 'Enter a valid 10 digit mobile number'; end if;
  if cleaned_aadhaar !~ '^[0-9]{12}$' then raise exception 'Enter a valid 12 digit Aadhaar number'; end if;
  if cleaned_pan !~ '^[A-Z]{5}[0-9]{4}[A-Z]$' then raise exception 'Enter a valid PAN number'; end if;
  if not coalesce(p_consent_accepted, false) then raise exception 'Verification consent is required'; end if;

  foreach document_path in array array[p_degree_document_path, p_aadhaar_document_path, p_pan_document_path] loop
    if document_path is null
       or split_part(document_path, '/', 1) <> caller_id::text
       or not exists (
         select 1 from storage.objects object
         where object.bucket_id = 'doctor-verification-files' and object.name = document_path
       ) then
      raise exception 'All required verification documents must be uploaded';
    end if;
  end loop;

  insert into public.doctor_applications (
    applicant_user_id, mobile_number, full_name, age, specialisations,
    aadhaar_hash, aadhaar_last_four, pan_hash, pan_last_four,
    degree_document_provided, aadhaar_document_provided, pan_document_provided,
    degree_document_path, aadhaar_document_path, pan_document_path, consent_accepted_at
  ) values (
    caller_id, cleaned_mobile, cleaned_name, p_age, p_specialisations,
    public.doctor_identity_fingerprint(cleaned_aadhaar), right(cleaned_aadhaar, 4),
    public.doctor_identity_fingerprint(cleaned_pan), right(cleaned_pan, 4),
    true, true, true,
    p_degree_document_path, p_aadhaar_document_path, p_pan_document_path, now()
  ) returning * into inserted_application;

  return query select inserted_application.id, inserted_application.reference_code, inserted_application.submitted_at;
exception
  when unique_violation then raise exception 'An active application already exists for these identity details';
end;
$$;
revoke all on function public.submit_doctor_application(text, text, integer, text[], text, text, text, text, text, boolean) from public, anon;
grant execute on function public.submit_doctor_application(text, text, integer, text[], text, text, text, text, text, boolean) to authenticated;
