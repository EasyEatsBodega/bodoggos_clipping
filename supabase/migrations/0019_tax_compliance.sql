-- Tax compliance ($600 / year reporting threshold).
--
-- When a clipper's earnings in a calendar year reach $600 they must submit
-- legal name + country before we can pay them; an admin then clears them for
-- payment (after the off-platform tax forms are completed). Tracked per tax
-- year so the requirement resets each January.
--
-- Writes happen server-side via the service role (clipper submit route + admin
-- clear route), so RLS only needs to grant clippers read access to their own
-- rows — they can never set cleared_at themselves.

create table if not exists public.clipper_tax_info (
  clipper_id        uuid not null references public.clippers(id) on delete cascade,
  tax_year          int  not null,
  legal_first_name  text not null,
  legal_last_name   text not null,
  country           text not null,
  submitted_at      timestamptz not null default now(),
  cleared_at        timestamptz,
  cleared_by        uuid references public.admin_users(id),
  primary key (clipper_id, tax_year)
);

alter table public.clipper_tax_info enable row level security;

drop policy if exists tax_info_self_read on public.clipper_tax_info;
create policy tax_info_self_read on public.clipper_tax_info
  for select to authenticated
  using (clipper_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists tax_info_admin_all on public.clipper_tax_info;
create policy tax_info_admin_all on public.clipper_tax_info
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
