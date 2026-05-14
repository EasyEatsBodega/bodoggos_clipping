-- Suspected engagement farming / bot-detection marks.
--
-- When admins identify a clip as suspected engagement farming, they mark
-- the clip here with a free-text reason. The clip stays in the system —
-- impressions keep tracking for overall metrics — but its billable
-- impression count drops to zero so the clipper isn't paid for it. The
-- mark is reversible: clearing botting_suspected restores normal payout
-- behaviour (a re-finalize would recompute payout_amount from the live
-- impression count).

alter table public.clips
  add column if not exists botting_suspected   boolean not null default false,
  add column if not exists botting_reason      text,
  add column if not exists botting_marked_at   timestamptz,
  add column if not exists botting_marked_by   uuid references public.admin_users(id);

create index if not exists idx_clips_botting_suspected
  on public.clips (clipper_id) where botting_suspected = true;
