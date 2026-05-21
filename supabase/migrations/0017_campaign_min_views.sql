-- Per-campaign minimum-views eligibility floor.
--
-- A campaign may set min_views: a clip earns $0 until its (final) impression
-- count reaches this floor. Once it crosses, CPM applies from the first view
-- (the floor is a pure gate, not a deductible). null = no floor.
--
-- Like cpm_rate / max_payout / flat_fee, the floor is snapshotted onto the
-- clip at submit time (min_views_snapshot) so later campaign edits never
-- retroactively change a clip's eligibility. Existing clips get null, so
-- historical payouts are unchanged.

alter table public.campaigns
  add column if not exists min_views integer
    check (min_views is null or min_views >= 0);

alter table public.clips
  add column if not exists min_views_snapshot integer
    check (min_views_snapshot is null or min_views_snapshot >= 0);
