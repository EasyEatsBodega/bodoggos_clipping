-- Backfill: clips that were flagged via the generic clip_flags system
-- (before suspected-engagement-farming had its own dedicated mark) get
-- promoted to botting_suspected=true so they show up in the per-clipper
-- bot report and stop counting toward payouts.
--
-- Scope: only clips with at least one OPEN flag (resolved_at IS NULL).
-- Resolved flags mean an admin reviewed and cleared the clip, so we
-- leave those alone.
--
-- For each affected clip:
--   - botting_suspected   = true
--   - botting_reason      = reason from the most recent open clip_flag
--   - botting_marked_at   = flagged_at from that flag
--   - botting_marked_by   = flagged_by from that flag
--   - payout_amount       = '0.00' if the clip is completed (so totals
--                           immediately reflect exclusion)
--
-- Idempotent: existing botting_suspected=true rows are skipped via the
-- WHERE clause.

with latest_open_flag as (
  select distinct on (clip_id)
    clip_id,
    reason,
    flagged_at,
    flagged_by
  from public.clip_flags
  where resolved_at is null
  order by clip_id, flagged_at desc
)
update public.clips c
   set botting_suspected = true,
       botting_reason    = lof.reason,
       botting_marked_at = lof.flagged_at,
       botting_marked_by = lof.flagged_by,
       payout_amount     = case
                             when c.status = 'completed' then '0.00'
                             else c.payout_amount
                           end
  from latest_open_flag lof
 where c.id = lof.clip_id
   and c.botting_suspected = false;
