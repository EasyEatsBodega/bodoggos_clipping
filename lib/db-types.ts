export type Clipper = {
  id: string;
  email: string;
  x_handle: string;
  x_user_id: string | null;
  auth_method: "magic_link" | "x_oauth";
  joined_at: string;
  banned: boolean;
  banned_at: string | null;
  banned_reason: string | null;
  solana_wallet: string | null;
  flat_fee_per_clip: string;
  cpm_rate_override: string | null;
  max_payout_override: string | null;
};

export type Clip = {
  id: string;
  clipper_id: string;
  campaign_id: string;
  url: string;
  tweet_id: string;
  submitted_at: string;
  tracking_until: string;
  status: "tracking" | "completed" | "rejected";
  rejected_reason: string | null;
  last_polled_at: string | null;
  poll_count: number;
  impressions: number;
  final_impressions: number | null;
  payout_amount: string | null;
  admin_override_impressions: number | null;
  admin_override_reason: string | null;
  cpm_rate_snapshot: string;
  max_payout_snapshot: string;
  flat_fee_snapshot: string;
  min_views_snapshot: number | null;
  x_author_id: string | null;
  botting_suspected: boolean;
  botting_reason: string | null;
  botting_marked_at: string | null;
  botting_marked_by: string | null;
  missing_poll_count: number;
};

export type ClipSnapshot = {
  id: string;
  clip_id: string;
  impressions: number;
  captured_at: string;
  source: "twitterapi_io" | "x_official" | "admin_manual";
};

export type Payout = {
  id: string;
  clipper_id: string;
  amount: string;
  chain: string;
  tx_hash: string | null;
  paid_at: string;
  note: string | null;
  created_by: string | null;
};

export type PayoutClipMark = {
  payout_id: string;
  clip_id: string;
  impressions_at_mark: number;
  created_at: string;
};

export type Campaign = {
  id: string;
  slug: string;
  name: string;
  cpm_rate: string;
  max_payout_per_clip: string;
  tracking_days: number;
  min_views: number | null;
  active: boolean;
  created_at: string;
  description: string | null;
  brief_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  budget_usd: string | null;
};

export type CampaignEnrollment = {
  clipper_id: string;
  campaign_id: string;
  enrolled_at: string;
};

export type ClipperTaxInfo = {
  clipper_id: string;
  tax_year: number;
  legal_first_name: string;
  legal_last_name: string;
  country: string;
  email: string;
  submitted_at: string;
  cleared_at: string | null;
  cleared_by: string | null;
};

export type ClipperFlag = {
  id: string;
  clipper_id: string;
  reason: string;
  flagged_by: string | null;
  flagged_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution: string | null;
};

export type ClipFlag = {
  id: string;
  clip_id: string;
  reason: string;
  flagged_by: string | null;
  flagged_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution: string | null;
};

export type ClipperAltHandle = {
  id: string;
  clipper_id: string;
  x_handle: string;
  note: string | null;
  added_by: string | null;
  added_at: string;
};

export type ClipTag = {
  id: string;
  slug: string;
  label: string;
  kind: "topic" | "creator" | "partner";
  sort_order: number;
  created_at: string;
};

export type ClipTagAssignment = {
  clip_id: string;
  tag_id: string;
  assigned_at: string;
  assigned_by: string | null;
};
