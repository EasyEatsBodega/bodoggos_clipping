-- Per-clipper sponsored post bonus. When set, it replaces the campaign's
-- sponsored_bonus_usd for this clipper's sponsored posts (in every
-- campaign); null = use the campaign setting. 0 = no bonus for this clipper.
--
-- Read wherever a clip picks up its bonus (clip submit, tag toggles via
-- lib/sponsored.ts) and snapshotted into clips.sponsored_bonus_snapshot like
-- the campaign value, so changing it never reprices already-tagged clips
-- unless the admin backfills from the pay-overrides form.
--
-- Visibility follows the other override columns (0007): clippers_self_read
-- lets a clipper see their own value, never anyone else's.
alter table public.clippers
  add column if not exists sponsored_bonus_override numeric(8,2)
    check (sponsored_bonus_override is null or sponsored_bonus_override >= 0);
