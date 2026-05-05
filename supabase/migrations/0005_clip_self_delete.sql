-- Allow a clipper to delete their own clip from the dashboard.
-- Snapshots are removed automatically via the existing ON DELETE CASCADE.

drop policy if exists clips_self_delete on public.clips;
create policy clips_self_delete on public.clips
  for delete to authenticated
  using (clipper_id = auth.uid() or public.is_admin(auth.uid()));
