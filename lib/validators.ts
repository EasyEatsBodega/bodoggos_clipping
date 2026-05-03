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

export const campaignConfigSchema = z.object({
  name: z.string().min(1).max(100),
  cpm_rate: z.number().positive(),
  max_payout_per_clip: z.number().positive(),
  tracking_days: z.number().int().min(1).max(90),
  active: z.boolean(),
});
