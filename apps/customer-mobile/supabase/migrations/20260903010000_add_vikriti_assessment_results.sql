alter table public.current_health_assessments
  add column vata_imbalanced boolean not null default false,
  add column pitta_imbalanced boolean not null default false,
  add column kapha_imbalanced boolean not null default false,
  add column conclusion text,
  add column conversation jsonb not null default '[]'::jsonb;
