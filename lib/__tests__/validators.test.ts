import { describe, expect, it } from "vitest";
import {
  campaignConfigSchema,
  clipSponsoredSchema,
  createCampaignSchema,
  submitClipSchema,
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

describe("clip submission validators", () => {
  const base = {
    url: "https://x.com/someone/status/1234567890",
    campaign_id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  };

  it("sponsored is optional and boolean", () => {
    expect(submitClipSchema.safeParse(base).success).toBe(true);
    expect(submitClipSchema.safeParse({ ...base, sponsored: true }).success).toBe(true);
    expect(submitClipSchema.safeParse({ ...base, sponsored: "yes" }).success).toBe(false);
  });

  it("post-submit toggle requires an explicit boolean", () => {
    expect(clipSponsoredSchema.safeParse({ sponsored: false }).success).toBe(true);
    expect(clipSponsoredSchema.safeParse({}).success).toBe(false);
    expect(clipSponsoredSchema.safeParse({ sponsored: 1 }).success).toBe(false);
  });
});
