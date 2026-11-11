alter table public.vikriti_validation_test_takes
  add column if not exists prakriti_vata_percentage smallint check (prakriti_vata_percentage between 0 and 100),
  add column if not exists prakriti_pitta_percentage smallint check (prakriti_pitta_percentage between 0 and 100),
  add column if not exists prakriti_kapha_percentage smallint check (prakriti_kapha_percentage between 0 and 100),
  add column if not exists patient_age smallint check (patient_age between 0 and 120),
  add column if not exists patient_gender text check (patient_gender in ('male', 'female', 'other')),
  add column if not exists patient_height_cm numeric(5, 2) check (patient_height_cm between 30 and 300),
  add column if not exists patient_weight_kg numeric(6, 2) check (patient_weight_kg between 1 and 500),
  add constraint vikriti_validation_prakriti_total check (
    (prakriti_vata_percentage is null and prakriti_pitta_percentage is null and prakriti_kapha_percentage is null)
    or prakriti_vata_percentage + prakriti_pitta_percentage + prakriti_kapha_percentage = 100
  );
