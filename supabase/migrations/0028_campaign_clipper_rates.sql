-- Per-clipper rates inside one campaign. Ghostwriting deals are negotiated
-- writer by writer, so an admin can give each enrolled clipper their own
-- weekly base, cpm, cap and sponsored bonus on the campaign page.
--
-- Every column is nullable: null = fall back to the clipper-wide override
-- (clippers.*_override) and then to the campaign default. Resolution lives
-- in lib/campaign-rates.ts. Rates are snapshotted onto each clip at submit
-- (and at sponsored-tag time), so editing them never reprices clips that
-- were already submitted.
--
-- This is its own table rather than columns on campaign_enrollments: a
-- clipper can delete and re-create their own enrollment (self-enroll /
-- unenroll), and a negotiated rate must survive that instead of resetting
-- to the campaign default. Clippers can read their own rows; only admins
-- (service role / is_admin) can write.
create table if not exists public.campaign_clipper_rates (
  campaign_id          uuid not null references public.campaigns(id) on delete cascade,
  clipper_id           uuid not null references public.clippers(id) on delete cascade,
  weekly_base_pay_usd  numeric(12,2) check (weekly_base_pay_usd is null or weekly_base_pay_usd >= 0),
  cpm_rate             numeric(8,2)  check (cpm_rate is null or cpm_rate >= 0),
  max_payout_per_clip  numeric(8,2)  check (max_payout_per_clip is null or max_payout_per_clip >= 0),
  sponsored_bonus_usd  numeric(8,2)  check (sponsored_bonus_usd is null or sponsored_bonus_usd >= 0),
  updated_at           timestamptz not null default now(),
  primary key (campaign_id, clipper_id)
);

create index if not exists idx_campaign_clipper_rates_clipper
  on public.campaign_clipper_rates (clipper_id);

alter table public.campaign_clipper_rates enable row level security;

drop policy if exists campaign_clipper_rates_self_read on public.campaign_clipper_rates;
create policy campaign_clipper_rates_self_read on public.campaign_clipper_rates
  for select to authenticated
  using (clipper_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists campaign_clipper_rates_admin_all on public.campaign_clipper_rates;
create policy campaign_clipper_rates_admin_all on public.campaign_clipper_rates
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
