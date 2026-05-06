-- Flagging system for review (e.g. suspected botting).
-- A flag is a lightweight admin annotation on a clip or a clipper. It does
-- NOT block payouts or hide the row anywhere automatically — it just marks
-- the row for follow-up. Resolving a flag closes it but keeps the audit row.

-- ---------- clipper flags ----------
create table if not exists public.clipper_flags (
  id            uuid primary key default gen_random_uuid(),
  clipper_id    uuid not null references public.clippers(id) on delete cascade,
  reason        text not null,
  flagged_by    uuid references public.admin_users(id),
  flagged_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  resolved_by   uuid references public.admin_users(id),
  resolution    text
);

create index if not exists idx_clipper_flags_clipper_id
  on public.clipper_flags (clipper_id);
create index if not exists idx_clipper_flags_open
  on public.clipper_flags (flagged_at desc) where resolved_at is null;

-- ---------- clip flags ----------
create table if not exists public.clip_flags (
  id            uuid primary key default gen_random_uuid(),
  clip_id       uuid not null references public.clips(id) on delete cascade,
  reason        text not null,
  flagged_by    uuid references public.admin_users(id),
  flagged_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  resolved_by   uuid references public.admin_users(id),
  resolution    text
);

create index if not exists idx_clip_flags_clip_id
  on public.clip_flags (clip_id);
create index if not exists idx_clip_flags_open
  on public.clip_flags (flagged_at desc) where resolved_at is null;

-- ---------- RLS ----------
alter table public.clipper_flags enable row level security;
alter table public.clip_flags    enable row level security;

drop policy if exists clipper_flags_admin_all on public.clipper_flags;
create policy clipper_flags_admin_all on public.clipper_flags
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists clip_flags_admin_all on public.clip_flags;
create policy clip_flags_admin_all on public.clip_flags
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
