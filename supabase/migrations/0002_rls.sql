-- RLS policies. Service role bypasses RLS (used by cron + admin endpoints).

alter table public.campaigns                    enable row level security;
alter table public.clippers                     enable row level security;
alter table public.clips                        enable row level security;
alter table public.clip_impression_snapshots    enable row level security;
alter table public.payouts                      enable row level security;
alter table public.admin_users                  enable row level security;

-- ---------- campaigns ----------
drop policy if exists campaigns_read_all on public.campaigns;
create policy campaigns_read_all on public.campaigns
  for select to authenticated using (true);

drop policy if exists campaigns_admin_write on public.campaigns;
create policy campaigns_admin_write on public.campaigns
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ---------- clippers ----------
drop policy if exists clippers_self_read on public.clippers;
create policy clippers_self_read on public.clippers
  for select to authenticated
  using (id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists clippers_self_update on public.clippers;
create policy clippers_self_update on public.clippers
  for update to authenticated
  using (id = auth.uid() or public.is_admin(auth.uid()))
  with check (id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists clippers_admin_all on public.clippers;
create policy clippers_admin_all on public.clippers
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ---------- clips ----------
drop policy if exists clips_self_read on public.clips;
create policy clips_self_read on public.clips
  for select to authenticated
  using (clipper_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists clips_self_insert on public.clips;
create policy clips_self_insert on public.clips
  for insert to authenticated
  with check (clipper_id = auth.uid());

drop policy if exists clips_admin_all on public.clips;
create policy clips_admin_all on public.clips
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ---------- snapshots ----------
drop policy if exists snapshots_self_read on public.clip_impression_snapshots;
create policy snapshots_self_read on public.clip_impression_snapshots
  for select to authenticated
  using (
    exists (
      select 1 from public.clips c
      where c.id = clip_impression_snapshots.clip_id
        and (c.clipper_id = auth.uid() or public.is_admin(auth.uid()))
    )
  );

-- (no insert policy: only service-role / admin-via is_admin can write)
drop policy if exists snapshots_admin_all on public.clip_impression_snapshots;
create policy snapshots_admin_all on public.clip_impression_snapshots
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ---------- payouts ----------
drop policy if exists payouts_self_read on public.payouts;
create policy payouts_self_read on public.payouts
  for select to authenticated
  using (clipper_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists payouts_admin_all on public.payouts;
create policy payouts_admin_all on public.payouts
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ---------- admin_users ----------
drop policy if exists admin_users_admin_all on public.admin_users;
create policy admin_users_admin_all on public.admin_users
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
