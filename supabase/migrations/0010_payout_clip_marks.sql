-- payout_clip_marks: per-clip impression watermarks attached to each payout.
--
-- When a payout is recorded we snapshot every non-rejected clip belonging
-- to the clipper at the moment of payment, capturing its current billable
-- impression count. The "rolling owed" calculation only counts impressions
-- (and capped CPM earnings) above the most recent watermark per clip, so
-- views can be paid mid-tracking without being double-counted on the next
-- payout.
create table if not exists public.payout_clip_marks (
  payout_id            uuid not null references public.payouts(id) on delete cascade,
  clip_id              uuid not null references public.clips(id) on delete cascade,
  impressions_at_mark  int  not null,
  created_at           timestamptz not null default now(),
  primary key (payout_id, clip_id)
);

create index if not exists idx_payout_clip_marks_clip
  on public.payout_clip_marks (clip_id);

alter table public.payout_clip_marks enable row level security;

drop policy if exists payout_clip_marks_admin_all on public.payout_clip_marks;
create policy payout_clip_marks_admin_all on public.payout_clip_marks
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- Clippers can see their own marks (lets them inspect what was paid for).
drop policy if exists payout_clip_marks_self_read on public.payout_clip_marks;
create policy payout_clip_marks_self_read on public.payout_clip_marks
  for select to authenticated
  using (
    exists (
      select 1 from public.payouts p
      where p.id = payout_clip_marks.payout_id
        and p.clipper_id = auth.uid()
    )
  );
