-- Let admins request tax info from a clipper proactively (before they hit the
-- $600 threshold). A request pre-creates the row with requested_at set and the
-- legal fields still empty; the clipper fills them in later. So the detail
-- columns must be nullable and we add request tracking.

alter table public.clipper_tax_info
  alter column legal_first_name drop not null,
  alter column legal_last_name  drop not null,
  alter column country          drop not null,
  alter column email            drop not null,
  alter column submitted_at     drop not null;

-- submitted_at no longer auto-fills; the submit route sets it explicitly so a
-- request-only row stays unsubmitted (submitted_at is null until the clipper
-- actually submits).
alter table public.clipper_tax_info
  alter column submitted_at drop default;

alter table public.clipper_tax_info
  add column if not exists requested_at timestamptz,
  add column if not exists requested_by uuid references public.admin_users(id);
