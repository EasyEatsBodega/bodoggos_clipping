-- Tags for clips. Admin-managed list + many-to-many assignments. A clip
-- can carry multiple tags (e.g. "trading" + "commentary").

-- ---------- clip_tags ----------
create table if not exists public.clip_tags (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null
              check (slug ~ '^[a-z0-9][a-z0-9_-]*$'),
  label       text not null,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists idx_clip_tags_sort_order on public.clip_tags (sort_order, label);

-- ---------- clip_tag_assignments ----------
create table if not exists public.clip_tag_assignments (
  clip_id     uuid not null references public.clips(id) on delete cascade,
  tag_id      uuid not null references public.clip_tags(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.admin_users(id),
  primary key (clip_id, tag_id)
);

create index if not exists idx_clip_tag_assignments_tag on public.clip_tag_assignments (tag_id);
create index if not exists idx_clip_tag_assignments_clip on public.clip_tag_assignments (clip_id);

-- ---------- RLS ----------
alter table public.clip_tags             enable row level security;
alter table public.clip_tag_assignments  enable row level security;

-- Tags are readable by any authenticated user (so clipper-side UI can
-- display them later if we want), but only admins can write.
drop policy if exists clip_tags_read on public.clip_tags;
create policy clip_tags_read on public.clip_tags
  for select to authenticated using (true);

drop policy if exists clip_tags_admin_write on public.clip_tags;
create policy clip_tags_admin_write on public.clip_tags
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- Assignments: a clipper can read assignments for their own clips so a
-- future clipper-side display can show tags; only admins can write.
drop policy if exists clip_tag_assignments_self_read on public.clip_tag_assignments;
create policy clip_tag_assignments_self_read on public.clip_tag_assignments
  for select to authenticated
  using (
    exists (
      select 1 from public.clips c
      where c.id = clip_tag_assignments.clip_id
        and (c.clipper_id = auth.uid() or public.is_admin(auth.uid()))
    )
  );

drop policy if exists clip_tag_assignments_admin_all on public.clip_tag_assignments;
create policy clip_tag_assignments_admin_all on public.clip_tag_assignments
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ---------- seed ----------
insert into public.clip_tags (slug, label, sort_order) values
  ('interview',  'Interview',           10),
  ('trading',    'Trading',             20),
  ('commentary', 'Commentary / Reaction', 30)
on conflict (slug) do nothing;
