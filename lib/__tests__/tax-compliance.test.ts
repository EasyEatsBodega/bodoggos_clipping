import { describe, expect, it } from "vitest";
import {
  TAX_THRESHOLD_CENTS,
  computeTaxStatus,
  earnedCentsInYear,
  paidCentsInYear,
  payoutBlocked,
} from "../tax-compliance";

const clip = (payout: string | null, year: number, status = "completed") => ({
  status,
  payout_amount: payout,
  tracking_until: `${year}-06-15T00:00:00.000Z`,
});

describe("earnedCentsInYear", () => {
  it("sums completed clips finalized in the year", () => {
    const clips = [clip("400.00", 2026), clip("250.00", 2026), clip("999.00", 2025)];
    expect(earnedCentsInYear(clips, 2026)).toBe(65_000);
    expect(earnedCentsInYear(clips, 2025)).toBe(99_900);
  });

  it("ignores tracking clips (no finalized payout)", () => {
    const clips = [clip(null, 2026, "tracking"), clip("100.00", 2026)];
    expect(earnedCentsInYear(clips, 2026)).toBe(10_000);
  });
});

describe("paidCentsInYear", () => {
  it("sums payouts in the year only", () => {
    const payouts = [
      { amount: "300.00", paid_at: "2026-02-01T00:00:00Z" },
      { amount: "350.00", paid_at: "2026-09-01T00:00:00Z" },
      { amount: "500.00", paid_at: "2025-12-01T00:00:00Z" },
    ];
    expect(paidCentsInYear(payouts, 2026)).toBe(65_000);
  });
});

describe("computeTaxStatus", () => {
  it("below threshold → no requirement, no hold", () => {
    const s = computeTaxStatus(59_900, null, 2026);
    expect(s.thresholdReached).toBe(false);
    expect(s.needsSubmission).toBe(false);
    expect(s.paymentHold).toBe(false);
  });

  it("at threshold, not submitted → needs submission + hold", () => {
    const s = computeTaxStatus(TAX_THRESHOLD_CENTS, null, 2026);
    expect(s.needsSubmission).toBe(true);
    expect(s.awaitingClearance).toBe(false);
    expect(s.paymentHold).toBe(true);
  });

  it("submitted, not cleared → awaiting clearance + hold", () => {
    const info = { legal_first_name: "A", legal_last_name: "B", country: "US", submitted_at: "x", cleared_at: null };
    const s = computeTaxStatus(70_000, info, 2026);
    expect(s.needsSubmission).toBe(false);
    expect(s.awaitingClearance).toBe(true);
    expect(s.paymentHold).toBe(true);
  });

  it("cleared → no hold", () => {
    const info = { legal_first_name: "A", legal_last_name: "B", country: "US", submitted_at: "x", cleared_at: "y" };
    const s = computeTaxStatus(120_000, info, 2026);
    expect(s.cleared).toBe(true);
    expect(s.paymentHold).toBe(false);
  });
});

describe("payoutBlocked", () => {
  it("allows payouts that stay under $600 with no prior earnings flag", () => {
    expect(payoutBlocked({ earnedCents: 40_000, paidCentsThisYear: 0, payoutCents: 50_000, cleared: false })).toBe(false);
  });

  it("blocks a payout that crosses $600 paid this year", () => {
    expect(payoutBlocked({ earnedCents: 40_000, paidCentsThisYear: 55_000, payoutCents: 10_000, cleared: false })).toBe(true);
  });

  it("blocks when earnings already past threshold", () => {
    expect(payoutBlocked({ earnedCents: 80_000, paidCentsThisYear: 0, payoutCents: 1_000, cleared: false })).toBe(true);
  });

  it("never blocks once cleared", () => {
    expect(payoutBlocked({ earnedCents: 999_999, paidCentsThisYear: 999_999, payoutCents: 999_999, cleared: true })).toBe(false);
  });
});
