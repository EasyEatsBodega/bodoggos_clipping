-- Per-clipper payout overrides + per-clip flat-fee snapshot.
-- Some clippers are on bespoke deals (e.g. flat $25/clip + $2 CPM cap $50).
-- The override columns are read at clip-submit time and snapshotted onto
-- the clip alongside the existing cpm_rate_snapshot/max_payout_snapshot,
-- so changing a clipper's deal mid-flight never alters tracking clips.
--
-- Visibility: the existing clippers_self_read RLS policy restricts
-- selects to id = auth.uid() (or admin), so a clipper sees their own
-- override columns but never another clipper's. No new policy needed.

-- ---------- clippers ----------
alter table public.clippers
  add column if not exists flat_fee_per_clip   numeric(8,2) not null default 0
    check (flat_fee_per_clip >= 0),
  add column if not exists cpm_rate_override   numeric(8,2)
    check (cpm_rate_override is null or cpm_rate_override >= 0),
  add column if not exists max_payout_override numeric(8,2)
    check (max_payout_override is null or max_payout_override >= 0);

-- ---------- clips ----------
-- Snapshotted at submit time. Default 0 keeps existing rows on the
-- standard CPM-only model.
alter table public.clips
  add column if not exists flat_fee_snapshot numeric(8,2) not null default 0
    check (flat_fee_snapshot >= 0);
