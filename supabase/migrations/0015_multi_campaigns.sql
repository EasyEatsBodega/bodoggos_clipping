-- Multi-campaign support: drop the single-active constraint, add brief / dates /
-- budget / slug fields, and add a campaign_enrollments join table so clippers
-- opt into specific campaigns before they can submit to them.

-- ---------- allow multiple active campaigns ----------
drop index if exists public.one_active_campaign;

-- ---------- new campaign fields ----------
alter table public.campaigns
  add column if not exists slug         text,
  add column if not exists description  text,
  add column if not exists brief_url    text,
  add column if not exists starts_at    timestamptz,
  add column if not exists ends_at      timestamptz,
  add column if not exists budget_usd   numeric(12,2);

-- Backfill slug for any existing rows (idempotent: only if null)
update public.campaigns
   set slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))
 where slug is null;

-- Strip any leading/trailing dashes from the backfilled slug
update public.campaigns
   set slug = trim(both '-' from slug)
 where slug is not null;

alter table public.campaigns
  alter column slug set not null;

create unique index if not exists campaigns_slug_unique on public.campaigns (slug);

-- ---------- campaign_enrollments ----------
create table if not exists public.campaign_enrollments (
  clipper_id  uuid not null references public.clippers(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  primary key (clipper_id, campaign_id)
);

create index if not exists idx_enrollments_campaign
  on public.campaign_enrollments (campaign_id);

-- Backfill: enroll every existing clipper into every currently-active campaign
-- so the existing flow keeps working without forcing everyone to re-enroll.
insert into public.campaign_enrollments (clipper_id, campaign_id)
select c.id, ca.id
  from public.clippers c
  cross join public.campaigns ca
 where ca.active = true
on conflict do nothing;

-- ---------- RLS for campaign_enrollments ----------
alter table public.campaign_enrollments enable row level security;

drop policy if exists enrollments_self_read on public.campaign_enrollments;
create policy enrollments_self_read on public.campaign_enrollments
  for select to authenticated
  using (clipper_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists enrollments_self_insert on public.campaign_enrollments;
create policy enrollments_self_insert on public.campaign_enrollments
  for insert to authenticated
  with check (clipper_id = auth.uid());

drop policy if exists enrollments_self_delete on public.campaign_enrollments;
create policy enrollments_self_delete on public.campaign_enrollments
  for delete to authenticated
  using (clipper_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists enrollments_admin_all on public.campaign_enrollments;
create policy enrollments_admin_all on public.campaign_enrollments
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
