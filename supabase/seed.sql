-- Seed the default active campaign. Idempotent (keyed on slug).
insert into public.campaigns (slug, name, cpm_rate, max_payout_per_clip, tracking_days, active)
select 'bodoggos-streams', 'BoDoggos Streams', 4.00, 75.00, 7, true
where not exists (select 1 from public.campaigns where slug = 'bodoggos-streams');
