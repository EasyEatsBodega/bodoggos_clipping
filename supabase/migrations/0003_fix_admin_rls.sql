-- Fix self-referential RLS on admin_users.
--
-- Problem: admin_users only has a policy that grants access when
-- public.is_admin(auth.uid()) returns true, and is_admin itself queries
-- admin_users. Because the function ran as SECURITY INVOKER, RLS applied
-- inside the function too, so a freshly-signed-in admin could not see their
-- own row — both the admin login check and the middleware's admin check
-- would always return no rows.

-- Re-declare is_admin as SECURITY DEFINER so its lookup bypasses RLS.
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.admin_users where id = uid);
$$;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated, service_role;

-- Allow an authenticated user to read their own admin_users row directly,
-- so the client-side post-login check works without relying on is_admin.
drop policy if exists admin_users_self_read on public.admin_users;
create policy admin_users_self_read on public.admin_users
  for select to authenticated
  using (id = auth.uid());
