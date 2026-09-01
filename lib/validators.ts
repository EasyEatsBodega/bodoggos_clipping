import { z } from "zod";
import type { ZodError } from "zod";

// First validation issue as a human-readable "field: message" string, so
// admin forms can say exactly what's wrong instead of a bare "invalid
// request" (e.g. `slug: lowercase letters, digits, dashes only`).
export function zodErrorSummary(err: ZodError): string {
  const issue = err.issues[0];
  if (!issue) return "invalid request";
  const path = issue.path.join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

export const submitClipSchema = z.object({
  url: z.string().min(1).max(500),
  campaign_id: z.string().uuid(),
  // Which creator's stream the clip came from (clip_tags row of kind
  // 'creator'). Enforced server-side whenever creator tags exist.
  creator_tag_id: z.string().uuid().optional(),
});

export const banSchema = z.object({
  banned: z.boolean(),
  reason: z.string().max(500).optional(),
});

export const rosterActiveSchema = z.object({
  active: z.boolean(),
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

export const bottingMarkSchema = z.object({
  reason: z.string().min(1).max(1000),
});

export const bulkBottingMarkSchema = z.object({
  clip_ids: z.array(z.string().uuid()).min(1).max(500),
  reason: z.string().min(1).max(1000),
});

export const resolveFlagSchema = z.object({
  resolution: z.string().max(500).optional(),
});

export const bulkResolveFlagsSchema = z
  .object({
    flag_ids: z.array(z.string().uuid()).max(500).optional(),
    clip_ids: z.array(z.string().uuid()).max(500).optional(),
    resolution: z.string().max(500).optional(),
  })
  .refine(
    (d) => (d.flag_ids?.length ?? 0) > 0 || (d.clip_ids?.length ?? 0) > 0,
    { message: "flag_ids or clip_ids required" },
  );

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

export const altHandleSchema = z.object({
  x_handle: z
    .string()
    .trim()
    .min(1)
    .max(15)
    .regex(/^[A-Za-z0-9_]+$/, "Letters, numbers, and underscore only"),
  note: z.string().max(200).optional(),
});

export const taxInfoSchema = z.object({
  legal_first_name: z.string().trim().min(1).max(100),
  legal_last_name: z.string().trim().min(1).max(100),
  country: z.string().trim().min(2).max(60),
  email: z.string().trim().email().max(254),
});

// Admin override for tax-clear: when an admin has collected the clipper's
// tax info off-platform (DM, email, signed PDF, etc.) and wants to record
// it directly + mark cleared without sending the clipper through the magic-
// link submission flow. email is optional — falls back to the clipper's
// account email server-side.
export const adminTaxClearSchema = z.object({
  legal_first_name: z.string().trim().min(1).max(100),
  legal_last_name: z.string().trim().min(1).max(100),
  country: z.string().trim().min(2).max(60),
  email: z.string().trim().email().max(254).optional(),
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
  kind: z.enum(["topic", "creator", "partner"]).optional(),
  sort_order: z.number().int().min(0).max(10000).optional(),
});

export const setClipTagsSchema = z
  .object({
    tag_ids: z.array(z.string().uuid()).max(20),
    // If kind is provided, only tags of that kind are replaced — other
    // kinds on the clip are preserved. Used so the creator picker and the
    // topic picker can save independently without clobbering each other.
    kind: z.enum(["topic", "creator", "partner"]).optional(),
  })
  // A clip can only be attributed to one partner at a time.
  .refine((d) => d.kind !== "partner" || d.tag_ids.length <= 1, {
    message: "a clip can have at most one partner",
    path: ["tag_ids"],
  });

export const createAdminSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(72),
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

const isoDateString = z.string().datetime({ offset: true });

export const campaignSlugSchema = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "lowercase letters, digits, dashes only");

const campaignConfigBase = z.object({
  name: z.string().min(1).max(100),
  // cpm 0 is allowed so weekly-base campaigns can track impressions
  // without paying per-view (base pay only).
  cpm_rate: z.number().nonnegative().max(1000),
  max_payout_per_clip: z.number().nonnegative().max(100_000),
  tracking_days: z.number().int().min(1).max(90),
  min_views: z.number().int().nonnegative().max(1_000_000_000).nullable().optional(),
  active: z.boolean(),
  description: z.string().max(500).nullable().optional(),
  brief_url: z.string().url().max(500).nullable().optional(),
  starts_at: isoDateString.nullable().optional(),
  ends_at: isoDateString.nullable().optional(),
  budget_usd: z.number().positive().max(10_000_000).nullable().optional(),
  weekly_base_pay_usd: z.number().positive().max(100_000).nullable().optional(),
  allow_external_authors: z.boolean().optional(),
});

// A per-clip campaign with no weekly base needs a real cpm rate, otherwise
// it would silently pay nothing.
const requiresSomePay = {
  check: (d: { weekly_base_pay_usd?: number | null; cpm_rate: number }) =>
    d.weekly_base_pay_usd != null || d.cpm_rate > 0,
  opts: { message: "set a cpm rate or a weekly base pay", path: ["cpm_rate"] },
};

export const campaignConfigSchema = campaignConfigBase.refine(
  requiresSomePay.check,
  requiresSomePay.opts,
);

export const createCampaignSchema = campaignConfigBase
  .extend({ slug: campaignSlugSchema })
  .refine(requiresSomePay.check, requiresSomePay.opts);
