-- Align supplement filtering metadata with VIKRITI_CORE_V1.0 answer IDs.
-- This migration is idempotent and also accepts rows already using the new format.
begin;

update public.shop_products
set
  for_symptoms = coalesce((
    select jsonb_agg(
      to_jsonb(
        case
          when jsonb_typeof(tag) = 'string' then tag #>> '{}'
          when tag->>'domain' = 'hunger' and tag->>'symptom' = 'Variable, inconsistent' then 'Q1:APPETITE_VARIABLE'
          when tag->>'domain' = 'hunger' and tag->>'symptom' = 'Strong, frequent' then 'Q1:APPETITE_STRONG'
          when tag->>'domain' = 'stool' and tag->>'symptom' = 'Hard, dry, difficult' then 'Q3:STOOL_DRY_HARD'
          when tag->>'domain' = 'stool' and tag->>'symptom' = 'Loose, frequent' then 'Q3:STOOL_LOOSE_BURNING'
          when tag->>'domain' = 'urine' and tag->>'symptom' = 'Infrequent, reduced' then 'Q4:URINE_REDUCED_IRREGULAR'
          when tag->>'domain' = 'urine' and tag->>'symptom' = 'Frequent, increased' then 'Q4:URINE_FREQUENT_INCREASED'
          when tag->>'domain' = 'sweat' and tag->>'symptom' = 'Excessive, frequent' then 'Q5:SWEAT_HIGH_HOT'
          when tag->>'domain' = 'thirst' and tag->>'symptom' = 'Strong, frequent' then 'Q6:THIRST_HIGH'
          when tag->>'domain' = 'sleep' and tag->>'symptom' = 'Light, disturbed' then 'Q7:SLEEP_LIGHT_DISTURBED'
          when tag->>'domain' = 'sleep' and tag->>'symptom' = 'Long, heavy' then 'Q7:SLEEP_EXCESS_HEAVY'
          else '__UNMAPPED__'
        end
      )
      order by ordinal
    )
    from jsonb_array_elements(shop_products.for_symptoms) with ordinality as symptom(tag, ordinal)
  ), '[]'::jsonb),
  updated_at = now();

do $$
begin
  if exists (
    select 1
    from public.shop_products product
    cross join lateral jsonb_array_elements(product.for_symptoms) as symptom(tag)
    where jsonb_typeof(symptom.tag) <> 'string'
       or symptom.tag #>> '{}' not in (
         'Q1:APPETITE_VARIABLE',
         'Q1:APPETITE_STRONG',
         'Q3:STOOL_DRY_HARD',
         'Q3:STOOL_LOOSE_BURNING',
         'Q4:URINE_REDUCED_IRREGULAR',
         'Q4:URINE_FREQUENT_INCREASED',
         'Q5:SWEAT_HIGH_HOT',
         'Q6:THIRST_HIGH',
         'Q7:SLEEP_LIGHT_DISTURBED',
         'Q7:SLEEP_EXCESS_HEAVY'
       )
  ) then
    raise exception 'One or more supplement for_symptoms values could not be mapped to VIKRITI_CORE_V1.0';
  end if;
end
$$;

commit;
