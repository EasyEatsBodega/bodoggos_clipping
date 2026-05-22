-- Collect a contact email with the clipper's tax info so we know where to send
-- the tax forms (may differ from their login email). Added separately because
-- 0019 has already been applied.

alter table public.clipper_tax_info
  add column if not exists email text not null default '';

-- Drop the placeholder default; the submit route always supplies a real value.
alter table public.clipper_tax_info
  alter column email drop default;
