-- Ghostwriting-style campaigns: a flat weekly base pay instead of per-clip
-- flat fees, plus permission to submit posts published on someone else's X
-- account (the clipper ghostwrites; the post goes out under another handle).
--
-- weekly_base_pay_usd: when set, enrolled clippers earn this flat amount per
-- ET week (Mon–Sun) in which they submit at least one counting clip. It is
-- implemented as a flat_fee_snapshot on the first counting clip of the week,
-- so all downstream accounting (finalize, rolling owed, tax, budget, CSV
-- exports) works unchanged. In these campaigns the per-clipper
-- flat_fee_per_clip does NOT apply — the weekly base replaces per-clip fees.
-- CPM still applies on top when cpm_rate > 0 (impressions keep being
-- tracked either way).
--
-- allow_external_authors: when true, the clip-submit author check (post must
-- come from the clipper's linked/alt handle) is skipped for this campaign.
alter table public.campaigns
  add column if not exists weekly_base_pay_usd    numeric(12,2),
  add column if not exists allow_external_authors boolean not null default false;
