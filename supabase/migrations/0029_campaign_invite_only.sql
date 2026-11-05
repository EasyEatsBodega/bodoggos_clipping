-- Invite-only campaigns: clippers can't enroll themselves; an admin adds
-- them from the campaign page (POST /api/admin/campaigns/[id]/clippers).
-- Used for ghostwriting deals where each writer is hand-picked. Invite-only
-- campaigns are hidden from clippers who aren't enrolled.
alter table public.campaigns
  add column if not exists invite_only boolean not null default false;

-- Enrollment writes go through the server (the clipper enroll route and the
-- admin route, both with the service role), which is where invite_only is
-- enforced. Drop the direct self-insert policy so a clipper can't skip that
-- check by inserting an enrollment row from the browser client.
drop policy if exists enrollments_self_insert on public.campaign_enrollments;
