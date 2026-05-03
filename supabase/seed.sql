-- Seed one active campaign. Idempotent.
insert into public.campaigns (name, cpm_rate, max_payout_per_clip, tracking_days, active)
select 'BODOGGOS S1', 4.00, 75.00, 7, true
where not exists (select 1 from public.campaigns where active = true);
