alter table public.vikriti_validation_test_takes
  add column if not exists yoga_recommendation_rating smallint,
  add column if not exists yoga_recommendation_comments text;

alter table public.vikriti_validation_test_takes
  drop constraint if exists vikriti_validation_yoga_rating_range;

alter table public.vikriti_validation_test_takes
  add constraint vikriti_validation_yoga_rating_range
  check (yoga_recommendation_rating is null or yoga_recommendation_rating between 1 and 5);
