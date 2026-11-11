-- Update existing catalogue entries with the expanded Vikriti symptom coverage.
begin;

create temporary table supplement_profile_updates (
  name text primary key,
  primary_category text not null,
  for_symptoms jsonb not null,
  pacifies text[] not null,
  may_aggravate text[] not null
) on commit drop;

insert into supplement_profile_updates
  (name, primary_category, for_symptoms, pacifies, may_aggravate)
values
  (
    'Pashanabheda',
    'Urinary & Kidney Health',
    '["Q4:URINE_REDUCED_IRREGULAR","Q4:URINE_DARK_BURNING","Q4:URINE_FREQUENT_INCREASED"]'::jsonb,
    array['Kapha', 'Pitta'],
    array[]::text[]
  ),
  (
    'Punarnava',
    'Urinary & Kidney Health',
    '["Q7:SLEEP_EXCESS_HEAVY","Q4:URINE_REDUCED_IRREGULAR","Q5:SWEAT_STICKY_HEAVY","Q6:THIRST_LOW_HEAVY","Q4:URINE_FREQUENT_INCREASED"]'::jsonb,
    array['Kapha', 'Vata'],
    array[]::text[]
  ),
  (
    'Guduchi (Giloy)',
    'Immunity & Wellness',
    '["Q1:APPETITE_STRONG","Q6:THIRST_HIGH","Q2:POSTMEAL_BURNING","Q4:URINE_DARK_BURNING","Q6:THIRST_VARIABLE","Q2:POSTMEAL_HEAVINESS"]'::jsonb,
    array['Pitta', 'Vata'],
    array[]::text[]
  ),
  (
    'Amalaki',
    'Immunity & Wellness',
    '["Q1:APPETITE_STRONG","Q6:THIRST_HIGH","Q3:STOOL_LOOSE_BURNING","Q2:POSTMEAL_BURNING","Q4:URINE_DARK_BURNING","Q6:THIRST_VARIABLE","Q7:SLEEP_LOW_HOT","Q2:POSTMEAL_HEAVINESS"]'::jsonb,
    array['Pitta', 'Vata'],
    array[]::text[]
  ),
  (
    'Fennel (Shatapushpa)',
    'Digestive Health',
    '["Q1:APPETITE_VARIABLE","Q1:APPETITE_STRONG","Q3:STOOL_LOOSE_BURNING","Q1:APPETITE_LOW","Q2:POSTMEAL_BLOATING","Q2:POSTMEAL_BURNING","Q6:THIRST_VARIABLE","Q2:POSTMEAL_HEAVINESS"]'::jsonb,
    array['Vata', 'Pitta'],
    array[]::text[]
  );

do $validation$
begin
  if (
    select count(*)
    from supplement_profile_updates source
    join public.shop_products target on target.name = source.name
  ) <> 5 then
    raise exception 'One or more supplement profiles could not be matched to an existing product';
  end if;
end
$validation$;

update public.shop_products target
set
  primary_category = source.primary_category,
  for_symptoms = source.for_symptoms,
  pacifies = source.pacifies,
  may_aggravate = source.may_aggravate,
  updated_at = now()
from supplement_profile_updates source
where target.name = source.name;

commit;
