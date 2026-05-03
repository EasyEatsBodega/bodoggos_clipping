-- Seed an admin by email. Run AFTER the user has signed in once (so auth.users exists).
-- Replace the email below before running.
insert into public.admin_users (id, email)
select u.id, u.email
from auth.users u
where u.email = 'admin@yourdomain.com'
on conflict (id) do nothing;
