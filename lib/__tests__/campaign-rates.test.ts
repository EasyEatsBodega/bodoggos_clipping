import { describe, expect, it } from "vitest";
import { resolveClipperPay } from "../campaign-rates";

const cpmCampaign = {
  cpm_rate: "2.00",
  max_payout_per_clip: "75.00",
  weekly_base_pay_usd: null,
  sponsored_bonus_usd: "25.00",
};

const weeklyCampaign = {
  cpm_rate: "0.75",
  max_payout_per_clip: "500.00",
  weekly_base_pay_usd: "50.00",
  sponsored_bonus_usd: "25.00",
};

const noRates = {
  weekly_base_pay_usd: null,
  cpm_rate: null,
  max_payout_per_clip: null,
  sponsored_bonus_usd: null,
};

describe("resolveClipperPay", () => {
  it("uses campaign defaults when nothing is overridden", () => {
    expect(resolveClipperPay(weeklyCampaign, null, null)).toEqual({
      cpmRate: 0.75,
      maxPayoutPerClip: 500,
      weeklyBasePay: 50,
      flatFeePerClip: 0,
      sponsoredBonus: 25,
    });
  });

  it("per-campaign rates beat the clipper-wide deal and the campaign", () => {
    const pay = resolveClipperPay(
      weeklyCampaign,
      { cpm_rate_override: "1.00", max_payout_override: "100.00", sponsored_bonus_override: "40.00" },
      {
        weekly_base_pay_usd: "120.00",
        cpm_rate: "1.50",
        max_payout_per_clip: "250.00",
        sponsored_bonus_usd: "60.00",
      },
    );
    expect(pay).toEqual({
      cpmRate: 1.5,
      maxPayoutPerClip: 250,
      weeklyBasePay: 120,
      flatFeePerClip: 0,
      sponsoredBonus: 60,
    });
  });

  it("blank per-campaign fields fall back field by field", () => {
    const pay = resolveClipperPay(
      weeklyCampaign,
      { cpm_rate_override: "1.00", sponsored_bonus_override: null },
      { ...noRates, weekly_base_pay_usd: "80.00" },
    );
    expect(pay.weeklyBasePay).toBe(80);
    expect(pay.cpmRate).toBe(1); // clipper-wide deal
    expect(pay.maxPayoutPerClip).toBe(500); // campaign
    expect(pay.sponsoredBonus).toBe(25); // campaign
  });

  it("a per-campaign 0 means none, not unset", () => {
    const pay = resolveClipperPay(weeklyCampaign, null, {
      weekly_base_pay_usd: "0.00",
      cpm_rate: "0.00",
      max_payout_per_clip: null,
      sponsored_bonus_usd: "0.00",
    });
    expect(pay.weeklyBasePay).toBe(0);
    expect(pay.cpmRate).toBe(0);
    expect(pay.sponsoredBonus).toBe(0);
  });

  it("ignores a weekly rate on a per-clip campaign and keeps the per-clip flat fee", () => {
    const pay = resolveClipperPay(
      cpmCampaign,
      { flat_fee_per_clip: "10.00" },
      { ...noRates, weekly_base_pay_usd: "100.00" },
    );
    expect(pay.weeklyBasePay).toBeNull();
    expect(pay.flatFeePerClip).toBe(10);
  });

  it("drops the per-clip flat fee in weekly-base campaigns", () => {
    expect(resolveClipperPay(weeklyCampaign, { flat_fee_per_clip: "10.00" }, null).flatFeePerClip).toBe(0);
  });
});
