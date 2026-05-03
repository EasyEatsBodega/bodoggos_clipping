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
  x_author_id: string | null;
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

export type Campaign = {
  id: string;
  name: string;
  cpm_rate: string;
  max_payout_per_clip: string;
  tracking_days: number;
  active: boolean;
  created_at: string;
};
