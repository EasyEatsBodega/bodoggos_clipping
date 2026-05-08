-- Adds a "kind" dimension to clip_tags so we can track *who* a clip is of
-- (creator) separately from *what topic* it covers (topic). Both kinds
-- share the same clip_tag_assignments table — assignment is multi-select
-- in either kind, e.g. a co-stream can carry two creators.

alter table public.clip_tags
  add column if not exists kind text not null default 'topic'
  check (kind in ('topic', 'creator'));

-- Querying tags-by-kind happens on every clips page load.
create index if not exists idx_clip_tags_kind on public.clip_tags (kind, sort_order, label);

-- Seed the four creators. Sort order leaves headroom between rows so the
-- order can be tweaked later without renumbering everything.
insert into public.clip_tags (slug, label, kind, sort_order) values
  ('creator-easy',     'Easy',     'creator', 100),
  ('creator-nick',     'Nick',     'creator', 110),
  ('creator-pio',      'Pio',      'creator', 120),
  ('creator-clemente', 'Clemente', 'creator', 130)
on conflict (slug) do nothing;
