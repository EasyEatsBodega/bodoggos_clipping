-- Add a Solana wallet address to the clipper profile so admins can pay them out.
-- Solana addresses are base58-encoded 32-byte public keys: 32-44 chars from the
-- base58 alphabet (excludes 0, O, I, l). We allow null until the user sets one.

alter table public.clippers
  add column if not exists solana_wallet text;

-- Format constraint. Use a partial check so existing rows (NULL) are unaffected.
alter table public.clippers
  drop constraint if exists clippers_solana_wallet_format;
alter table public.clippers
  add constraint clippers_solana_wallet_format
  check (
    solana_wallet is null
    or solana_wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
  );
