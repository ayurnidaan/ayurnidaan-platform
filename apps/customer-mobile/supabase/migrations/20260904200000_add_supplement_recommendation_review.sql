alter table public.vikriti_validation_test_takes
  add column if not exists supplement_recommendation_rating smallint,
  add column if not exists supplement_recommendation_comments text;

alter table public.vikriti_validation_test_takes
  drop constraint if exists vikriti_validation_supplement_rating_range;

alter table public.vikriti_validation_test_takes
  add constraint vikriti_validation_supplement_rating_range
  check (supplement_recommendation_rating is null or supplement_recommendation_rating between 1 and 5);
