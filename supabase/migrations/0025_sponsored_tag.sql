-- Built-in "sponsored" tag. Unlike every other tag (admin-assigned), this one
-- is self-selected by the clipper: a checkbox at submission (and a toggle on
-- their clip page) marks the post as a paid / sponsored placement. It's an
-- ordinary topic-kind clip_tags row so admins get the clips-page filter,
-- per-tag metrics on /admin/tags and the TagPicker for free — the slug is
-- the contract the app looks it up by (lib/tags.ts). Deleting it turns the
-- clipper-side controls off.
insert into public.clip_tags (slug, label, kind, sort_order) values
  ('sponsored', 'Sponsored', 'topic', 5)
on conflict (slug) do nothing;
