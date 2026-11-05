import { effectiveSponsoredBonus } from "./payout-calc";

// Per-clipper rates within one campaign (campaign_clipper_rates). Each
// field is nullable: null = no campaign-specific rate for that clipper.
export type CampaignClipperRates = {
  campaign_id: string;
  clipper_id: string;
  weekly_base_pay_usd: string | null;
  cpm_rate: string | null;
  max_payout_per_clip: string | null;
  sponsored_bonus_usd: string | null;
  updated_at: string;
};

type CampaignPayDefaults = {
  cpm_rate: string | number;
  max_payout_per_clip: string | number;
  weekly_base_pay_usd: string | number | null;
  sponsored_bonus_usd: string | number | null;
};

type ClipperPayOverrides = {
  flat_fee_per_clip?: string | number | null;
  cpm_rate_override?: string | number | null;
  max_payout_override?: string | number | null;
  sponsored_bonus_override?: string | number | null;
};

type RatesLike = Pick<
  CampaignClipperRates,
  "weekly_base_pay_usd" | "cpm_rate" | "max_payout_per_clip" | "sponsored_bonus_usd"
>;

export type ResolvedPay = {
  cpmRate: number;
  maxPayoutPerClip: number;
  // Weekly base this clipper earns in a weekly-base campaign; null when the
  // campaign is per-clip (cpm) mode.
  weeklyBasePay: number | null;
  // Per-clip flat fee (clipper-wide deal). Always 0 in weekly-base
  // campaigns, where the weekly base replaces per-clip fees.
  flatFeePerClip: number;
  sponsoredBonus: number;
};

// What one clipper earns in one campaign. Most specific wins:
//   campaign_clipper_rates (this clipper, this campaign)
//   → clippers.*_override (this clipper, every campaign)
//   → campaign default
// The weekly base only exists in weekly-base campaigns: a per-clipper
// weekly rate on a cpm campaign is ignored rather than switching modes.
export function resolveClipperPay(
  campaign: CampaignPayDefaults,
  clipper: ClipperPayOverrides | null | undefined,
  rates: RatesLike | null | undefined,
): ResolvedPay {
  const weeklyMode = campaign.weekly_base_pay_usd != null;
  return {
    cpmRate: Number(rates?.cpm_rate ?? clipper?.cpm_rate_override ?? campaign.cpm_rate ?? 0),
    maxPayoutPerClip: Number(
      rates?.max_payout_per_clip ??
        clipper?.max_payout_override ??
        campaign.max_payout_per_clip ??
        0,
    ),
    weeklyBasePay: weeklyMode
      ? Number(rates?.weekly_base_pay_usd ?? campaign.weekly_base_pay_usd)
      : null,
    flatFeePerClip: weeklyMode ? 0 : Number(clipper?.flat_fee_per_clip ?? 0),
    sponsoredBonus: effectiveSponsoredBonus(
      rates?.sponsored_bonus_usd ?? clipper?.sponsored_bonus_override,
      campaign.sponsored_bonus_usd,
    ),
  };
}
