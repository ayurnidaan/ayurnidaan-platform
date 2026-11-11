-- A signed access token can remain cryptographically valid until its expiry even
-- after the Auth user is deleted. Add a restrictive policy to every current
-- RLS-protected public table so such a token cannot read or recreate data.

do $$
declare
  target_table regclass;
begin
  foreach target_table in array array[
    'public.profiles'::regclass,
    'public.prakriti_assessments'::regclass,
    'public.current_health_assessments'::regclass,
    'public.appointments'::regclass,
    'public.shop_products'::regclass,
    'public.shop_orders'::regclass,
    'public.shop_order_items'::regclass,
    'public.user_addresses'::regclass,
    'public.assessment_reviews'::regclass,
    'public.doctor_applications'::regclass,
    'public.verified_doctors'::regclass,
    'public.prakriti_validation_test_takes'::regclass,
    'public.vikriti_validation_test_takes'::regclass,
    'public.food_recommendation_plans'::regclass,
    'public.yoga_poses'::regclass,
    'public.yoga_recommendation_plans'::regclass,
    'public.supplement_recommendation_plans'::regclass,
    'public.food_intake_items'::regclass,
    'public.payment_transactions'::regclass,
    'public.appointment_clinical_audit'::regclass,
    'public.consent_events'::regclass,
    'public.api_rate_limits'::regclass,
    'public.doctor_identity_keys'::regclass
  ]
  loop
    execute format('drop policy if exists %I on %s', 'Active authenticated users only', target_table);
    execute format(
      'create policy %I on %s as restrictive for all to authenticated using (public.current_auth_user_exists()) with check (public.current_auth_user_exists())',
      'Active authenticated users only',
      target_table
    );
  end loop;
end
$$;

