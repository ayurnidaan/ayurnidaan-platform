alter table public.yoga_poses
  add column if not exists image_asset text;

update public.yoga_poses as pose
set image_asset = image_data.image_asset
from (values
  (1, 'Tadasana', '01-tadasana-mountain-pose.webp'),
  (2, 'Vrikshasana', '02-vrikshasana-tree-pose.webp'),
  (3, 'Trikonasana', '03-trikonasana-triangle-pose.webp'),
  (4, 'Virabhadrasana I', '04-virabhadrasana-1-warrior-1.webp'),
  (5, 'Virabhadrasana II', '05-virabhadrasana-2-warrior-2.webp'),
  (6, 'Utkatasana', '06-utkatasana-chair-pose.webp'),
  (7, 'Malasana', '07-malasana-garland-pose.webp'),
  (8, 'Adho Mukha Svanasana', '08-adho-mukha-svanasana-downward-dog.webp'),
  (9, 'Bhujangasana', '09-bhujangasana-cobra-pose.webp'),
  (10, 'Salabhasana', '10-salabhasana-locust-pose.webp'),
  (11, 'Setu Bandhasana', '11-setu-bandhasana-bridge-pose.webp'),
  (12, 'Marjaryasana-Bitilasana', '12-marjaryasana-bitilasana-cat-cow.webp'),
  (13, 'Balasana', '13-balasana-childs-pose.webp'),
  (14, 'Sukhasana', '14-sukhasana-easy-pose.webp'),
  (15, 'Vajrasana', '15-vajrasana-thunderbolt-pose.webp'),
  (16, 'Baddha Konasana', '16-baddha-konasana-bound-angle-pose.webp'),
  (17, 'Paschimottanasana', '17-paschimottanasana-seated-forward-bend.webp'),
  (18, 'Janu Sirsasana', '18-janu-sirsasana-head-to-knee-pose.webp'),
  (19, 'Ardha Matsyendrasana', '19-ardha-matsyendrasana-half-lord-of-fishes.webp'),
  (20, 'Supta Matsyendrasana', '20-supta-matsyendrasana-supine-spinal-twist.webp'),
  (21, 'Pavanamuktasana', '21-pavanamuktasana-wind-relieving-pose.webp'),
  (22, 'Apanasana', '22-apanasana-knees-to-chest-pose.webp'),
  (23, 'Ananda Balasana', '23-ananda-balasana-happy-baby-pose.webp'),
  (24, 'Viparita Karani', '24-viparita-karani-legs-up-wall-pose.webp'),
  (25, 'Supta Baddha Konasana', '25-supta-baddha-konasana-reclining-bound-angle.webp'),
  (26, 'Savasana', '26-savasana-corpse-pose.webp'),
  (27, 'Surya Namaskar', '27-surya-namaskar-sun-salutation.webp'),
  (28, 'Uttanasana', '28-uttanasana-standing-forward-bend.webp'),
  (29, 'Parsvakonasana', '29-parsvakonasana-extended-side-angle.webp'),
  (30, 'Dhanurasana', '30-dhanurasana-bow-pose.webp'),
  (31, 'Makarasana', '31-makarasana-crocodile-pose.webp')
) as image_data(sort_order, name, image_asset)
where pose.sort_order = image_data.sort_order
  and pose.name = image_data.name;

alter table public.yoga_poses
  add constraint yoga_poses_image_asset_filename
  check (image_asset is null or image_asset ~ '^[0-9]{2}-[a-z0-9-]+[.]webp$');

comment on column public.yoga_poses.image_asset is
  'Bundled application asset filename for the pose illustration.';
