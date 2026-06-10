-- Roster status: which clippers are currently "on the program". Softer than
-- banned (which suspends login entirely): inactive clippers can still sign
-- in and see their dashboard/history, but new clip submissions are rejected
-- so their future clips don't count toward campaign spend. Existing clips
-- keep tracking and paying out normally — deactivation is forward-looking.
alter table public.clippers
  add column if not exists roster_active boolean not null default true;

create index if not exists idx_clippers_roster_active
  on public.clippers (roster_active) where roster_active = false;
