-- Sponsored post bonus: a clip the clipper tags "sponsored" earns a flat
-- bonus (campaign setting, default $25) on top of its cpm / weekly base.
--
-- The bonus is folded into clips.flat_fee_snapshot so every money path
-- (finalize, rolling owed, tax, budget, exports) already counts it;
-- clips.sponsored_bonus_snapshot records the component so toggling the tag
-- off removes exactly what was added, and so per-clipper override backfills
-- can preserve it (lib/sponsored.ts keeps the two in step with the tag).
--
-- payout_clip_marks.flat_fee_at_mark records the flat amount the ledger
-- considered paid at each payout. A post tagged sponsored AFTER it was paid
-- then shows its bonus as newly owed instead of being treated as already
-- settled by the impression watermark. Null = legacy mark (old behaviour).
alter table public.campaigns
  add column if not exists sponsored_bonus_usd numeric(8,2) not null default 25.00
    check (sponsored_bonus_usd >= 0);

alter table public.clips
  add column if not exists sponsored_bonus_snapshot numeric(8,2) not null default 0
    check (sponsored_bonus_snapshot >= 0);

alter table public.payout_clip_marks
  add column if not exists flat_fee_at_mark numeric(12,2);
