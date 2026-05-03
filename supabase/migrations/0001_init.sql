-- bodoggos_clipping initial schema
-- All money is numeric(12,2). All timestamps are timestamptz.

create extension if not exists "pgcrypto";

-- ---------- campaigns ----------
create table if not exists public.campaigns (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  cpm_rate            numeric(8,2) not null default 4.00,
  max_payout_per_clip numeric(8,2) not null default 75.00,
  tracking_days       int not null default 7,
  active              boolean not null default true,
  created_at          timestamptz not null default now()
);

-- enforce single active campaign
create unique index if not exists one_active_campaign
  on public.campaigns (active) where active = true;

-- ---------- clippers ----------
create table if not exists public.clippers (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  x_handle      text unique not null,
  x_user_id     text unique,
  auth_method   text not null check (auth_method in ('magic_link', 'x_oauth')),
  joined_at     timestamptz not null default now(),
  banned        boolean not null default false,
  banned_at     timestamptz,
  banned_reason text
);

-- handle is stored lowercase; enforce
create or replace function public.lowercase_x_handle()
returns trigger language plpgsql as $$
begin
  new.x_handle := lower(new.x_handle);
  return new;
end;
$$;

drop trigger if exists trg_lowercase_x_handle on public.clippers;
create trigger trg_lowercase_x_handle
  before insert or update on public.clippers
  for each row execute function public.lowercase_x_handle();

-- ---------- clips ----------
create table if not exists public.clips (
  id                          uuid primary key default gen_random_uuid(),
  clipper_id                  uuid not null references public.clippers(id) on delete cascade,
  campaign_id                 uuid not null references public.campaigns(id),
  url                         text not null,
  tweet_id                    text not null unique,
  submitted_at                timestamptz not null default now(),
  tracking_until              timestamptz not null,
  status                      text not null default 'tracking'
                              check (status in ('tracking', 'completed', 'rejected')),
  rejected_reason             text,
  last_polled_at              timestamptz,
  poll_count                  int not null default 0,
  impressions                 int not null default 0,
  final_impressions           int,
  payout_amount               numeric(12,2),
  admin_override_impressions  int,
  admin_override_reason       text,
  -- snapshot of campaign config at submit time so mid-flight rate changes don't apply
  cpm_rate_snapshot           numeric(8,2) not null,
  max_payout_snapshot         numeric(8,2) not null,
  -- author x_user_id captured at submit so handle changes don't break tracking
  x_author_id                 text
);

create index if not exists idx_clips_status_tracking_until
  on public.clips (status, tracking_until);
create index if not exists idx_clips_clipper_id on public.clips (clipper_id);

-- ---------- clip_impression_snapshots ----------
create table if not exists public.clip_impression_snapshots (
  id          uuid primary key default gen_random_uuid(),
  clip_id     uuid not null references public.clips(id) on delete cascade,
  impressions int not null,
  captured_at timestamptz not null default now(),
  source      text not null
              check (source in ('twitterapi_io', 'x_official', 'admin_manual'))
);

create index if not exists idx_snapshots_clip_id_captured_at
  on public.clip_impression_snapshots (clip_id, captured_at);

-- ---------- payouts ----------
create table if not exists public.payouts (
  id          uuid primary key default gen_random_uuid(),
  clipper_id  uuid not null references public.clippers(id),
  amount      numeric(12,2) not null check (amount > 0),
  chain       text not null,
  tx_hash     text,
  paid_at     timestamptz not null default now(),
  note        text,
  created_by  uuid
);

create index if not exists idx_payouts_clipper_id on public.payouts (clipper_id);

-- ---------- admin_users ----------
create table if not exists public.admin_users (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  created_at timestamptz not null default now()
);

-- ---------- helper: link auth.uid() to clipper id ----------
-- We treat clippers.id as the same uuid as auth.users.id when the row was created
-- via Supabase auth. The auth flow inserts the clippers row with id = auth.uid().
create or replace function public.is_admin(uid uuid)
returns boolean language sql stable as $$
  select exists(select 1 from public.admin_users where id = uid);
$$;
