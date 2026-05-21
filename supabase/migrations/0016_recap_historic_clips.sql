-- One-time backfill: re-cap historic payouts so every completed clip obeys
-- the same ceiling as the live payout formula in lib/payout-calc.ts:
--
--   payout = flat_fee_snapshot + LEAST(cpm_earned, max_payout_snapshot)
--
-- where cpm_earned (in dollars) = floor(impressions * cpm_rate / 10) / 100,
-- i.e. integer-cent math identical to computePayoutCents:
--   earned_cents = floor(impressions * (cpm_rate * 100) / 1000)
--               = floor(impressions * cpm_rate / 10)
--
-- The CPM portion is capped at max_payout_snapshot (= $75 for BoDoggos
-- Streams); the flat fee stacks on top, so a flat-fee clipper can exceed
-- $75 by exactly their flat fee. This is idempotent — re-running produces
-- the same values.
--
-- Scope:
--   - status = 'completed' only (tracking clips have null payout until
--     finalized; rejected clips stay null)
--   - botting_suspected clips are left at their zeroed payout
update public.clips
set payout_amount =
      round(coalesce(flat_fee_snapshot, 0), 2)
    + least(
        floor(coalesce(final_impressions, impressions, 0) * cpm_rate_snapshot / 10.0) / 100.0,
        max_payout_snapshot
      )
where status = 'completed'
  and coalesce(botting_suspected, false) = false
  and payout_amount is not null;
