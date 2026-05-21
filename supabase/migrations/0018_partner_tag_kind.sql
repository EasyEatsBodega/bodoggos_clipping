-- Add a third clip_tags kind: 'partner'. Partners are a cross-cutting
-- accounting label (independent of campaign) so we can attribute specific
-- clips to a business partner. One partner per clip is enforced in the UI /
-- API (single-select), but the assignment storage is the same shared
-- clip_tag_assignments table as creator/topic tags.

alter table public.clip_tags drop constraint if exists clip_tags_kind_check;
alter table public.clip_tags
  add constraint clip_tags_kind_check check (kind in ('topic', 'creator', 'partner'));
