-- Fourth clip_tags kind: 'format' — the content format of a post (e.g.
-- "Office skits", "that's so true"). Clippers pick it from a dropdown when
-- submitting a clip; admins can filter by it on /admin/clips and the
-- overview, see per-format metrics on /admin/tags, and fix it with the
-- TagPicker. One format per clip (single-select, like partner).
alter table public.clip_tags drop constraint if exists clip_tags_kind_check;
alter table public.clip_tags
  add constraint clip_tags_kind_check
  check (kind in ('topic', 'creator', 'partner', 'format'));

insert into public.clip_tags (slug, label, kind, sort_order) values
  ('office-skits',  'Office skits',    'format', 200),
  ('thats-so-true', 'that''s so true', 'format', 210)
on conflict (slug) do nothing;
