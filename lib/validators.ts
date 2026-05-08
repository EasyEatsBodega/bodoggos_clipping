import { z } from "zod";

export const submitClipSchema = z.object({
  url: z.string().min(1).max(500),
});

export const banSchema = z.object({
  banned: z.boolean(),
  reason: z.string().max(500).optional(),
});

export const overrideClipSchema = z.object({
  impressions: z.number().int().nonnegative(),
  reason: z.string().min(1).max(500),
});

export const rejectClipSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const flagSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const resolveFlagSchema = z.object({
  resolution: z.string().max(500).optional(),
});

export const payoutSchema = z.object({
  clipper_id: z.string().uuid(),
  amount: z.number().positive(),
  chain: z.string().min(1).max(50),
  tx_hash: z.string().max(200).optional(),
  note: z.string().max(500).optional(),
});

export const onboardingSchema = z.object({
  x_handle: z
    .string()
    .min(1)
    .max(15)
    .regex(/^[A-Za-z0-9_]+$/, "Letters, numbers, and underscore only"),
});

export const walletSchema = z.object({
  solana_wallet: z
    .string()
    .trim()
    .regex(
      /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
      "Must be a valid Solana address (base58, 32–44 chars)",
    )
    .nullable(),
});

export const tagSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9][a-z0-9_-]*$/, "lowercase letters, digits, dash, underscore"),
  label: z.string().min(1).max(60),
  kind: z.enum(["topic", "creator"]).optional(),
  sort_order: z.number().int().min(0).max(10000).optional(),
});

export const setClipTagsSchema = z.object({
  tag_ids: z.array(z.string().uuid()).max(20),
  // If kind is provided, only tags of that kind are replaced — other
  // kinds on the clip are preserved. Used so the creator picker and the
  // topic picker can save independently without clobbering each other.
  kind: z.enum(["topic", "creator"]).optional(),
});

export const solanaPayoutConfirmSchema = z.object({
  clipper_id: z.string().uuid(),
  amount: z.number().positive(),
  signature: z.string().min(40).max(120),
  note: z.string().max(500).optional(),
});

export const payOverridesSchema = z.object({
  flat_fee_per_clip: z.number().nonnegative().max(10000),
  cpm_rate_override: z.number().nonnegative().max(1000).nullable(),
  max_payout_override: z.number().nonnegative().max(100000).nullable(),
  apply_to_existing: z.boolean().optional(),
});

export const campaignConfigSchema = z.object({
  name: z.string().min(1).max(100),
  cpm_rate: z.number().positive(),
  max_payout_per_clip: z.number().positive(),
  tracking_days: z.number().int().min(1).max(90),
  active: z.boolean(),
});
