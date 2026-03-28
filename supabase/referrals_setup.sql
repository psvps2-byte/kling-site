alter table public.users
  add column if not exists referral_code text unique,
  add column if not exists referred_by uuid references public.users(id) on delete set null,
  add column if not exists referred_at timestamptz;

create table if not exists public.referral_visits (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references public.users(id) on delete cascade,
  referral_code text not null,
  visitor_token text not null,
  landing_path text,
  signed_up_user_id uuid references public.users(id) on delete set null,
  signed_up_at timestamptz,
  purchase_payment_id uuid,
  purchase_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists referral_visits_referrer_idx on public.referral_visits(referrer_user_id, created_at desc);
create index if not exists referral_visits_visitor_idx on public.referral_visits(visitor_token, created_at desc);

alter table public.payments
  add column if not exists referral_discount_percent numeric(5,4) default 0,
  add column if not exists referral_code_used text,
  add column if not exists referrer_user_id uuid references public.users(id) on delete set null,
  add column if not exists referral_reward_points integer default 0,
  add column if not exists referral_reward_points_awarded boolean default false;

create index if not exists payments_referrer_idx on public.payments(referrer_user_id, created_at desc);

create table if not exists public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  requested_points integer not null check (requested_points > 0),
  amount_usd numeric(10,2) not null check (amount_usd > 0),
  card_number text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'PROCESSING', 'PAID', 'REJECTED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists withdrawal_requests_user_idx on public.withdrawal_requests(user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_withdrawal_requests_updated_at on public.withdrawal_requests;
create trigger trg_withdrawal_requests_updated_at
before update on public.withdrawal_requests
for each row
execute function public.set_updated_at();
