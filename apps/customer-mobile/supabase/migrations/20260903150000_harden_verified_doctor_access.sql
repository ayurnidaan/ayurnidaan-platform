revoke select on table public.verified_doctors from anon, authenticated;
grant select (
  id,
  full_name,
  specialisations,
  qualification,
  registration_number,
  focus_areas,
  experience_years,
  about,
  consultation_fee,
  rating,
  rating_count,
  photo_url,
  verified_at
) on table public.verified_doctors to anon, authenticated;
comment on table public.verified_doctors is
  'Verified doctor profiles. Mobile clients can read only explicitly granted public profile columns.';
