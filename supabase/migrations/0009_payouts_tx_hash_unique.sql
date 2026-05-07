-- Prevent the same on-chain transaction from being recorded as two
-- separate payout rows. Partial unique index so manually-logged payouts
-- (no tx_hash) are still allowed alongside multiple null rows.
create unique index if not exists payouts_tx_hash_unique
  on public.payouts (tx_hash)
  where tx_hash is not null;
