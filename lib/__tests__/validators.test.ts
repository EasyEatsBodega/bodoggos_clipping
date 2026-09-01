import { describe, expect, it } from "vitest";
import {
  campaignConfigSchema,
  createCampaignSchema,
  zodErrorSummary,
} from "../validators";

const validConfig = {
  name: "BoDoggos Writer Campaign",
  cpm_rate: 0.75,
  max_payout_per_clip: 500,
  tracking_days: 7,
  active: false,
  weekly_base_pay_usd: 50,
  allow_external_authors: true,
};

describe("campaign validators", () => {
  it("accepts a weekly-base config with cpm 0 (base pay only)", () => {
    expect(
      campaignConfigSchema.safeParse({ ...validConfig, cpm_rate: 0 }).success,
    ).toBe(true);
  });

  it("rejects cpm 0 with no weekly base — campaign would pay nothing", () => {
    const r = campaignConfigSchema.safeParse({
      ...validConfig,
      cpm_rate: 0,
      weekly_base_pay_usd: null,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(zodErrorSummary(r.error)).toBe("cpm_rate: set a cpm rate or a weekly base pay");
    }
  });

  it("rejects a spaced/uppercase slug with a field-specific message", () => {
    const r = createCampaignSchema.safeParse({
      ...validConfig,
      slug: "BoDoggos Writer Campaign",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(zodErrorSummary(r.error)).toBe(
        "slug: lowercase letters, digits, dashes only",
      );
    }
  });

  it("accepts the sanitized form of the same slug", () => {
    expect(
      createCampaignSchema.safeParse({
        ...validConfig,
        slug: "bodoggos-writer-campaign",
      }).success,
    ).toBe(true);
  });
});
