-- Vaidya IPD Care: PostgreSQL schema migrated from the original SQLite model.
-- Identifiers remain camelCase so the existing API response contract is preserved.

create table if not exists public.users (
  id text primary key,
  name text not null,
  email text unique not null,
  hash text not null,
  salt text not null
);

create table if not exists public.sessions (
  token text primary key,
  "userId" text not null references public.users(id) on delete cascade,
  csrf text not null,
  expires double precision not null
);

create table if not exists public.patients (
  id text primary key,
  name text not null,
  age integer not null,
  gender text not null,
  phone text not null,
  address text not null,
  "admissionDate" text not null,
  "dischargeDate" text not null,
  "nextVisit" text not null,
  diagnosis text not null,
  physician text not null,
  room text not null,
  "bloodGroup" text not null,
  allergies text not null,
  favourite integer not null default 0,
  "vitalsMode" text not null default 'three_session',
  "createdAt" text not null,
  status text not null default 'Admitted',
  "dischargedAt" text not null default ''
);

create table if not exists public.therapies (
  id text primary key,
  name text not null,
  category text not null,
  price double precision not null check (price >= 0),
  duration integer not null,
  active integer not null default 1
);

create table if not exists public.vitals (
  id text primary key,
  "patientId" text not null references public.patients(id) on delete cascade,
  date text not null,
  session text not null,
  time text not null,
  height double precision,
  weight double precision,
  temperature double precision,
  pulse double precision,
  bp text not null,
  rr double precision,
  "painScore" double precision,
  fbs double precision,
  ppbs double precision,
  rbs double precision,
  spo2 double precision,
  sleep text not null,
  bowel text not null,
  appetite text not null,
  unique ("patientId", date, session)
);

create table if not exists public.assignments (
  id text primary key,
  "patientId" text not null references public.patients(id) on delete cascade,
  date text not null,
  session text not null,
  "therapyId" text not null references public.therapies(id),
  status text not null default 'Scheduled',
  "unitPriceCents" integer not null default -1,
  "estimateId" text,
  unique ("patientId", date, session, "therapyId")
);

create table if not exists public.notes (
  id text primary key,
  "patientId" text not null references public.patients(id) on delete cascade,
  date text not null,
  session text not null,
  text text not null,
  author text not null,
  "createdAt" text not null
);

create table if not exists public.records (
  id text primary key,
  "patientId" text not null references public.patients(id) on delete cascade,
  kind text not null,
  title text not null,
  detail text not null,
  date text not null,
  status text not null,
  quantity double precision not null,
  amount double precision not null,
  session text not null,
  "createdAt" text not null,
  metadata text not null default '{}'
);

create table if not exists public.documents (
  id text primary key,
  "patientId" text not null references public.patients(id) on delete cascade,
  name text not null,
  mime text not null,
  size integer not null,
  filename text not null,
  "createdAt" text not null
);

create table if not exists public.inventory (
  id text primary key,
  name text not null,
  stock double precision not null check (stock >= 0),
  unit text not null,
  price double precision not null check (price >= 0),
  "reorderLevel" double precision not null default 10
);

create table if not exists public.bills (
  id text primary key,
  "patientId" text not null references public.patients(id),
  title text not null,
  amount double precision not null check (amount > 0),
  status text not null,
  "createdAt" text not null,
  number text not null default '',
  "paidCents" integer not null default 0,
  "requestId" text
);

create unique index if not exists idx_invoice_request
  on public.bills ("requestId") where "requestId" is not null;

create table if not exists public.audit (
  id text primary key,
  "patientId" text references public.patients(id),
  action text not null,
  entity text not null,
  author text not null,
  "createdAt" text not null
);

create table if not exists public.bill_items (
  id text primary key,
  "billId" text not null references public.bills(id) on delete cascade,
  description text not null,
  quantity double precision not null,
  "unitPriceCents" integer not null,
  "amountCents" integer not null,
  source text unique
);

create table if not exists public.payments (
  id text primary key,
  "billId" text not null references public.bills(id),
  "amountCents" integer not null check ("amountCents" > 0),
  method text not null,
  reference text not null,
  date text not null,
  author text not null,
  "createdAt" text not null
);

create table if not exists public.stock_movements (
  id text primary key,
  "inventoryId" text not null references public.inventory(id),
  "patientId" text references public.patients(id),
  delta double precision not null,
  reason text not null,
  author text not null,
  "createdAt" text not null
);

create table if not exists public.estimate_batches (
  id text primary key,
  "patientId" text not null references public.patients(id),
  session text not null,
  status text not null default 'Draft',
  "scheduledAt" text not null default '',
  "invoiceId" text references public.bills(id),
  "createdAt" text not null
);

create table if not exists public.estimate_lines (
  id text primary key,
  "batchId" text not null references public.estimate_batches(id),
  "recordId" text unique not null references public.records(id) on delete cascade,
  "therapyId" text not null references public.therapies(id),
  days integer not null,
  "unitPriceCents" integer not null
);

create table if not exists public.rooms (
  id text primary key,
  name text unique not null,
  type text not null,
  capacity integer not null,
  rate double precision not null,
  active integer not null default 1
);

create table if not exists public.room_stays (
  id text primary key,
  "patientId" text not null references public.patients(id),
  "roomId" text not null references public.rooms(id),
  "startDate" text not null,
  "endDate" text not null,
  rate double precision not null,
  status text not null,
  "recordId" text not null references public.records(id)
);

create unique index if not exists idx_active_room_stay
  on public.room_stays ("patientId") where status = 'Active';

create table if not exists public.physicians (
  id text primary key,
  name text unique not null,
  speciality text not null,
  phone text not null,
  email text not null,
  active integer not null default 1
);

create table if not exists public.practice (
  id integer primary key check (id = 1),
  name text not null,
  tagline text not null,
  phone text not null,
  address text not null
);

insert into public.practice (id, name, tagline, phone, address)
values (1, 'Healthier India', 'Ayurveda & wellness', '', '')
on conflict (id) do nothing;

create index if not exists idx_vitals_patient on public.vitals ("patientId", date);
create index if not exists idx_records_patient on public.records ("patientId", kind);
create index if not exists idx_assignment_patient on public.assignments ("patientId", date);
create index if not exists idx_audit_patient on public.audit ("patientId", "createdAt");
create index if not exists idx_bill_patient on public.bills ("patientId", "createdAt");
create index if not exists idx_payment_bill on public.payments ("billId");
create index if not exists idx_stock_item on public.stock_movements ("inventoryId", "createdAt");
create index if not exists idx_room_stays on public.room_stays ("roomId", status);

insert into public.rooms (id, name, type, capacity, rate, active) values
  ('room-a204', 'A-204', 'Private', 1, 2000, 1),
  ('room-a205', 'A-205', 'Private', 1, 2000, 1),
  ('room-b101', 'B-101', 'Shared', 2, 1200, 1),
  ('room-c101', 'C-101', 'General', 4, 800, 1)
on conflict (id) do nothing;

-- The application server is the sole data-access boundary. Block direct access
-- through the public Data API; the backend connects with its database role.
alter table public.users enable row level security;
alter table public.sessions enable row level security;
alter table public.patients enable row level security;
alter table public.therapies enable row level security;
alter table public.vitals enable row level security;
alter table public.assignments enable row level security;
alter table public.notes enable row level security;
alter table public.records enable row level security;
alter table public.documents enable row level security;
alter table public.inventory enable row level security;
alter table public.bills enable row level security;
alter table public.audit enable row level security;
alter table public.bill_items enable row level security;
alter table public.payments enable row level security;
alter table public.stock_movements enable row level security;
alter table public.estimate_batches enable row level security;
alter table public.estimate_lines enable row level security;
alter table public.rooms enable row level security;
alter table public.room_stays enable row level security;
alter table public.physicians enable row level security;
alter table public.practice enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'patient-documents',
  'patient-documents',
  false,
  10485760,
  array['application/pdf', 'image/png', 'image/jpeg']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
