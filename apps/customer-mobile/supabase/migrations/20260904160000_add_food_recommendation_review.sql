alter table public.vikriti_validation_test_takes
  add column if not exists food_recommendation_rating smallint,
  add column if not exists food_recommendation_comments text;

alter table public.vikriti_validation_test_takes
  drop constraint if exists vikriti_validation_food_rating_range;

alter table public.vikriti_validation_test_takes
  add constraint vikriti_validation_food_rating_range
  check (food_recommendation_rating is null or food_recommendation_rating between 1 and 5);
