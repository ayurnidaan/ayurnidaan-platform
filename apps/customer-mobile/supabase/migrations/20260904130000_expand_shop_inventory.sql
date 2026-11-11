-- Expands the catalogue supplied by the product team and makes category filters data-driven.
create temporary table shop_inventory_import (
  name text not null,
  primary_category text not null,
  sort_order integer not null
) on commit drop;

insert into shop_inventory_import (name, primary_category, sort_order)
values
  ('Ashwagandha', 'Energy & Vitality', 1),
  ('Shatavari', 'Women''s Wellness', 2),
  ('Guduchi (Giloy)', 'Immunity & Wellness', 3),
  ('Amalaki', 'Immunity & Wellness', 4),
  ('Haritaki', 'Digestive Health', 5),
  ('Bibhitaki', 'Digestive Health', 6),
  ('Brahmi', 'Cognitive & Memory', 7),
  ('Shankhpushpi', 'Cognitive & Memory', 8),
  ('Yashtimadhu (Licorice)', 'Respiratory Health', 9),
  ('Tulsi', 'Respiratory Health', 10),
  ('Gokshura', 'Urinary & Kidney Health', 11),
  ('Punarnava', 'Urinary & Kidney Health', 12),
  ('Arjuna', 'Heart & Circulatory Health', 13),
  ('Neem', 'Skin & Hair', 14),
  ('Turmeric (Haridra)', 'Joint & Muscle Health', 15),
  ('Ginger (Shunthi)', 'Digestive Health', 16),
  ('Black Pepper (Maricha)', 'Digestive Health', 17),
  ('Long Pepper (Pippali)', 'Respiratory Health', 18),
  ('Cinnamon (Tvak)', 'Digestive Health', 19),
  ('Cardamom (Ela)', 'Digestive Health', 20),
  ('Clove (Lavanga)', 'Respiratory Health', 21),
  ('Fennel (Shatapushpa)', 'Digestive Health', 22),
  ('Cumin (Jiraka)', 'Digestive Health', 23),
  ('Fenugreek (Methi)', 'Weight & Metabolism', 24),
  ('Ajwain (Yavani)', 'Digestive Health', 25),
  ('Triphala', 'Digestive Health', 26),
  ('Hing', 'Digestive Health', 27),
  ('Chitrak', 'Digestive Health', 28),
  ('Musta', 'Digestive Health', 29),
  ('Bilva', 'Digestive Health', 30),
  ('Dadima', 'Digestive Health', 31),
  ('Kutaja', 'Digestive Health', 32),
  ('Vasaka (Vasa)', 'Respiratory Health', 33),
  ('Kantakari', 'Respiratory Health', 34),
  ('Pushkaramula', 'Respiratory Health', 35),
  ('Bharangi', 'Respiratory Health', 36),
  ('Talisapatra', 'Respiratory Health', 37),
  ('Jatamansi', 'Stress & Sleep', 38),
  ('Vacha', 'Cognitive & Memory', 39),
  ('Mandukaparni', 'Cognitive & Memory', 40),
  ('Jyotishmati', 'Cognitive & Memory', 41),
  ('Tagara', 'Stress & Sleep', 42),
  ('Varuna', 'Urinary & Kidney Health', 43),
  ('Pashanabheda', 'Urinary & Kidney Health', 44),
  ('Ikshu', 'Urinary & Kidney Health', 45),
  ('Ushira', 'Urinary & Kidney Health', 46),
  ('Ashoka', 'Women''s Wellness', 47),
  ('Lodhra', 'Women''s Wellness', 48),
  ('Kumari (Aloe Vera)', 'Women''s Wellness', 49),
  ('Bala', 'Joint & Muscle Health', 50),
  ('Manjistha', 'Skin & Hair', 51),
  ('Sariva', 'Skin & Hair', 52),
  ('Khadira', 'Skin & Hair', 53),
  ('Bakuchi', 'Skin & Hair', 54),
  ('Triphala Churna', 'Digestive Health', 55),
  ('Trikatu Churna', 'Digestive Health', 56),
  ('Chyawanprash', 'Immunity & Wellness', 57),
  ('Ashwagandha Churna', 'Energy & Vitality', 58),
  ('Sitopaladi Churna', 'Respiratory Health', 59),
  ('Talisadi Churna', 'Respiratory Health', 60),
  ('Avipattikar Churna', 'Digestive Health', 61),
  ('Hingvastak Churna', 'Digestive Health', 62),
  ('Sudarshan Churna', 'Immunity & Wellness', 63),
  ('Dashamoola Churna', 'Joint & Muscle Health', 64),
  ('Brahmi Churna', 'Cognitive & Memory', 65),
  ('Shatavari Churna', 'Women''s Wellness', 66),
  ('Arjuna Churna', 'Heart & Circulatory Health', 67),
  ('Arogyavardhini Vati', 'General Wellness', 68),
  ('Chandraprabha Vati', 'Urinary & Kidney Health', 69),
  ('Yogaraja Guggulu', 'Joint & Muscle Health', 70),
  ('Triphala Guggulu', 'Digestive Health', 71),
  ('Kanchanara Guggulu', 'General Wellness', 72),
  ('Punarnavadi Guggulu', 'Urinary & Kidney Health', 73),
  ('Kaishore Guggulu', 'Joint & Muscle Health', 74),
  ('Gokshuradi Guggulu', 'Urinary & Kidney Health', 75),
  ('Ashwagandharishta', 'Energy & Vitality', 76),
  ('Arjunarishta', 'Heart & Circulatory Health', 77),
  ('Dashamularishta', 'Joint & Muscle Health', 78),
  ('Draksharishta', 'Digestive Health', 79),
  ('Abhayarishta', 'Digestive Health', 80),
  ('Kumaryasava', 'Women''s Wellness', 81),
  ('Saraswatarishta', 'Cognitive & Memory', 82),
  ('Balarishta', 'Joint & Muscle Health', 83),
  ('Jeerakadyarishta', 'Digestive Health', 84),
  ('Amritarishta', 'Immunity & Wellness', 85),
  ('Sesame Oil (Tila Taila)', 'General Wellness', 86),
  ('Coconut Oil', 'Skin & Hair', 87),
  ('Mahanarayan Taila', 'Joint & Muscle Health', 88),
  ('Dhanwantharam Taila', 'Joint & Muscle Health', 89),
  ('Kottamchukkadi Taila', 'Joint & Muscle Health', 90),
  ('Brahmi Taila', 'Stress & Sleep', 91),
  ('Bhringraj Taila', 'Skin & Hair', 92),
  ('Neelibhringadi Taila', 'Skin & Hair', 93),
  ('Bala Taila', 'Joint & Muscle Health', 94),
  ('Ksheerabala Taila', 'Joint & Muscle Health', 95),
  ('Anu Taila', 'Respiratory Health', 96),
  ('Jatamansi Taila', 'Stress & Sleep', 97);

with prepared as (
  select
    trim(both '-' from regexp_replace(regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'), '-+', '-', 'g')) as id,
    name,
    primary_category,
    sort_order,
    case
      when lower(name) like '%taila%' or lower(name) like '%oil%' then '200 ml'
      when lower(name) like '%arishta%' or lower(name) like '%asava%' or lower(name) like '%arka%' then '450 ml'
      when lower(name) like '%avaleha%' or lower(name) like '%chyawanprash%' then '500 g'
      when lower(name) like '%churna%' or lower(name) like '%bhasma%' or lower(name) like '%pishti%' or lower(name) like '%kshara%' then '100 g'
      else '500 mg · 60 tablets'
    end as weight,
    case name
      when 'Ashwagandha' then 599
      when 'Chyawanprash' then 449
      when 'Triphala' then 399
      when 'Brahmi' then 499
      else 299 + ((sort_order % 5) * 50)
    end as price
  from shop_inventory_import
)
insert into public.shop_products
  (id, name, weight, price, mrp, icon, categories, tags, description, rating, rating_count, active, sort_order, updated_at)
select
  id,
  name,
  weight,
  price,
  price + 100,
  upper(left(name, 1)),
  array[primary_category],
  array_remove(array[
    case when sort_order <= 8 then 'recommended' end,
    case when name in ('Ashwagandha', 'Shatavari', 'Guduchi (Giloy)', 'Amalaki', 'Brahmi', 'Tulsi', 'Triphala', 'Chyawanprash') then 'best-seller' end,
    lower(replace(replace(primary_category, ' & ', '-'), ' ', '-'))
  ], null),
  name || ' is an Ayurvedic formulation selected to support ' || lower(primary_category) || '.',
  4.5 + ((sort_order % 4)::numeric / 10),
  120 + (sort_order * 9),
  true,
  sort_order,
  now()
from prepared
on conflict (id) do update set
  name = excluded.name,
  weight = excluded.weight,
  price = excluded.price,
  mrp = excluded.mrp,
  icon = excluded.icon,
  categories = excluded.categories,
  tags = excluded.tags,
  description = excluded.description,
  rating = excluded.rating,
  rating_count = excluded.rating_count,
  active = true,
  sort_order = excluded.sort_order,
  updated_at = now();

update public.shop_products
set active = false, updated_at = now()
where id not in (
  select trim(both '-' from regexp_replace(regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'), '-+', '-', 'g'))
  from shop_inventory_import
);

