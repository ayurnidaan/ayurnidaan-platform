create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check (purpose in ('appointment', 'shop')),
  amount_paise integer not null check (amount_paise > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  status text not null default 'created' check (status in ('created', 'paid', 'failed', 'cancelled')),
  razorpay_order_id text unique,
  razorpay_payment_id text unique,
  checkout_token uuid not null unique default gen_random_uuid(),
  redirect_url text not null,
  payload jsonb not null default '{}'::jsonb,
  resource_id uuid,
  error_message text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);

create index payment_transactions_user_created_idx
  on public.payment_transactions (user_id, created_at desc);

alter table public.payment_transactions enable row level security;
revoke all on table public.payment_transactions from anon, authenticated;
grant select on table public.payment_transactions to authenticated;

create policy "Users can read their own payments"
on public.payment_transactions for select to authenticated
using ((select auth.uid()) = user_id);
