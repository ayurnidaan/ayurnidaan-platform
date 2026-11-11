-- Complete erasure from Supabase's active Auth, Database and Storage systems.
-- Provider-managed backups and logs remain governed by Supabase retention.

create or replace function public.current_auth_user_exists()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users
    where id = (select auth.uid())
  )
$$;
revoke all on function public.current_auth_user_exists() from public, anon;
grant execute on function public.current_auth_user_exists() to authenticated;

drop policy if exists "Users can upload their own avatar" on storage.objects;
create policy "Users can upload their own avatar"
on storage.objects for insert to authenticated
with check (
  public.current_auth_user_exists()
  and bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can update their own avatar" on storage.objects;
create policy "Users can update their own avatar"
on storage.objects for update to authenticated
using (
  public.current_auth_user_exists()
  and bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  public.current_auth_user_exists()
  and bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can read their own avatar" on storage.objects;
create policy "Users can read their own avatar"
on storage.objects for select to authenticated
using (
  public.current_auth_user_exists()
  and bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can delete their own avatar" on storage.objects;
create policy "Users can delete their own avatar"
on storage.objects for delete to authenticated
using (
  public.current_auth_user_exists()
  and bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can upload their doctor intake files" on storage.objects;
create policy "Users can upload their doctor intake files"
on storage.objects for insert to authenticated
with check (
  public.current_auth_user_exists()
  and bucket_id = 'doctor-intake-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can read their doctor intake files" on storage.objects;
create policy "Users can read their doctor intake files"
on storage.objects for select to authenticated
using (
  public.current_auth_user_exists()
  and bucket_id = 'doctor-intake-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can delete their doctor intake files" on storage.objects;
create policy "Users can delete their doctor intake files"
on storage.objects for delete to authenticated
using (
  public.current_auth_user_exists()
  and bucket_id = 'doctor-intake-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Applicants can upload their verification files" on storage.objects;
create policy "Applicants can upload their verification files"
on storage.objects for insert to authenticated
with check (
  public.current_auth_user_exists()
  and bucket_id = 'doctor-verification-files'
  and split_part(name, '/', 1) = (select auth.uid())::text
);

drop policy if exists "Applicants can read their verification files" on storage.objects;
create policy "Applicants can read their verification files"
on storage.objects for select to authenticated
using (
  public.current_auth_user_exists()
  and bucket_id = 'doctor-verification-files'
  and split_part(name, '/', 1) = (select auth.uid())::text
);

drop policy if exists "Applicants can delete their verification files" on storage.objects;
create policy "Applicants can delete their verification files"
on storage.objects for delete to authenticated
using (
  public.current_auth_user_exists()
  and bucket_id = 'doctor-verification-files'
  and split_part(name, '/', 1) = (select auth.uid())::text
);

create or replace function public.purge_user_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  application_ids uuid[];
  doctor_ids uuid[];
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select coalesce(array_agg(source.application_id), array[]::uuid[])
  into application_ids
  from (
    select application.id as application_id
    from public.doctor_applications application
    where application.applicant_user_id = p_user_id
    union
    select doctor.application_id
    from public.verified_doctors doctor
    where doctor.auth_user_id = p_user_id
  ) source;

  select coalesce(array_agg(doctor.id), array[]::uuid[])
  into doctor_ids
  from public.verified_doctors doctor
  where doctor.auth_user_id = p_user_id
     or doctor.application_id = any(application_ids);

  -- Preserve other patients' appointment history while removing the departing
  -- practitioner's identity and private clinical audit attribution.
  delete from public.appointment_clinical_audit
  where doctor_user_id = p_user_id;

  update public.appointments
  set verified_doctor_id = null,
      doctor_name = 'Deleted practitioner',
      doctor_initials = '--'
  where verified_doctor_id = any(doctor_ids);

  delete from public.verified_doctors
  where id = any(doctor_ids);

  delete from public.doctor_applications
  where id = any(application_ids)
     or applicant_user_id = p_user_id;

  update public.doctor_applications
  set reviewed_by = null
  where reviewed_by = p_user_id;
end;
$$;
revoke all on function public.purge_user_data(uuid) from public, anon, authenticated;
grant execute on function public.purge_user_data(uuid) to service_role;

create or replace function public.verify_user_data_erased(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining bigint;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select coalesce(sum(count_value), 0)
  into remaining
  from (
    select count(*)::bigint as count_value from auth.users where id = p_user_id
    union all select count(*) from auth.identities where user_id = p_user_id
    union all select count(*) from auth.sessions where user_id = p_user_id
    union all select count(*) from public.profiles where user_id = p_user_id
    union all select count(*) from public.prakriti_assessments where user_id = p_user_id
    union all select count(*) from public.current_health_assessments where user_id = p_user_id
    union all select count(*) from public.appointments where user_id = p_user_id
    union all select count(*) from public.shop_orders where user_id = p_user_id
    union all select count(*) from public.shop_order_items where user_id = p_user_id
    union all select count(*) from public.user_addresses where user_id = p_user_id
    union all select count(*) from public.assessment_reviews where user_id = p_user_id
    union all select count(*) from public.prakriti_validation_test_takes where reviewer_user_id = p_user_id
    union all select count(*) from public.vikriti_validation_test_takes where reviewer_user_id = p_user_id
    union all select count(*) from public.food_recommendation_plans where user_id = p_user_id
    union all select count(*) from public.yoga_recommendation_plans where user_id = p_user_id
    union all select count(*) from public.supplement_recommendation_plans where user_id = p_user_id
    union all select count(*) from public.food_intake_items where user_id = p_user_id
    union all select count(*) from public.payment_transactions where user_id = p_user_id
    union all select count(*) from public.consent_events where user_id = p_user_id
    union all select count(*) from public.api_rate_limits where user_id = p_user_id
    union all select count(*) from public.appointment_clinical_audit where doctor_user_id = p_user_id
    union all select count(*) from public.doctor_applications where applicant_user_id = p_user_id or reviewed_by = p_user_id
    union all select count(*) from public.verified_doctors where auth_user_id = p_user_id
    union all select count(*) from storage.objects
      where bucket_id in ('avatars', 'doctor-intake-files', 'doctor-verification-files')
        and split_part(name, '/', 1) = p_user_id::text
  ) counts;

  return jsonb_build_object('erased', remaining = 0, 'remaining_records', remaining);
end;
$$;
revoke all on function public.verify_user_data_erased(uuid) from public, anon, authenticated;
grant execute on function public.verify_user_data_erased(uuid) to service_role;

comment on function public.purge_user_data(uuid) is
  'Service-only removal of user-linked records that are intentionally not ON DELETE CASCADE.';
comment on function public.verify_user_data_erased(uuid) is
  'Service-only active-system erasure verification across Auth, public data and user storage paths.';
