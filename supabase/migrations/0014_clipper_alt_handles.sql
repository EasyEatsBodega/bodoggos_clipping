-- Per-clipper whitelist of additional X handles they're allowed to
-- submit clips from. Default behaviour stays: the tweet author must
-- match the clipper's primary x_handle. An admin can whitelist one or
-- more extra handles per clipper for cases where a clipper legitimately
-- posts from a second account (alt, brand account, etc).
--
-- Handles are stored lowercase to match the existing clippers table
-- convention.

create table if not exists public.clipper_alt_handles (
  id          uuid primary key default gen_random_uuid(),
  clipper_id  uuid not null references public.clippers(id) on delete cascade,
  x_handle    text not null,
  note        text,
  added_by    uuid references public.admin_users(id),
  added_at    timestamptz not null default now(),
  unique (clipper_id, x_handle)
);

create or replace function public.lowercase_alt_handle()
returns trigger language plpgsql as $$
begin
  new.x_handle := lower(new.x_handle);
  return new;
end;
$$;

drop trigger if exists trg_lowercase_alt_handle on public.clipper_alt_handles;
create trigger trg_lowercase_alt_handle
  before insert or update on public.clipper_alt_handles
  for each row execute function public.lowercase_alt_handle();

create index if not exists idx_clipper_alt_handles_clipper
  on public.clipper_alt_handles (clipper_id);

alter table public.clipper_alt_handles enable row level security;

drop policy if exists clipper_alt_handles_admin_all on public.clipper_alt_handles;
create policy clipper_alt_handles_admin_all on public.clipper_alt_handles
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- Clippers can see their own whitelisted handles (so a future dashboard
-- panel could surface them) but cannot write.
drop policy if exists clipper_alt_handles_self_read on public.clipper_alt_handles;
create policy clipper_alt_handles_self_read on public.clipper_alt_handles
  for select to authenticated
  using (clipper_id = auth.uid());
