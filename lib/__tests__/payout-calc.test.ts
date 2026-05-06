import { describe, expect, it } from "vitest";
import { computePayoutAmount, computePayoutCents, sumNumeric } from "../payout-calc";

describe("computePayoutCents", () => {
  it("zero impressions → 0", () => {
    expect(computePayoutCents(0, 4, 75)).toBe(0);
  });

  it("1000 impressions at $4 CPM → $4.00", () => {
    expect(computePayoutCents(1000, 4, 75)).toBe(400);
    expect(computePayoutAmount(1000, 4, 75)).toBe("4.00");
  });

  it("12,345 impressions at $4 CPM → $49.38 (rounded down)", () => {
    expect(computePayoutCents(12345, 4, 75)).toBe(4938);
    expect(computePayoutAmount(12345, 4, 75)).toBe("49.38");
  });

  it("hits cap at high impressions", () => {
    expect(computePayoutCents(1_000_000, 4, 75)).toBe(7500);
    expect(computePayoutAmount(1_000_000, 4, 75)).toBe("75.00");
  });

  it("string rate works", () => {
    expect(computePayoutAmount(1000, "4.00", "75.00")).toBe("4.00");
  });

  it("negative impressions → 0", () => {
    expect(computePayoutCents(-100, 4, 75)).toBe(0);
  });

  it("flat fee with 0 impressions → just the flat fee", () => {
    expect(computePayoutCents(0, 2, 50, 25)).toBe(2500);
    expect(computePayoutAmount(0, 2, 50, 25)).toBe("25.00");
  });

  it("flat fee + CPM is additive ($25 + $2 CPM at 1k impressions)", () => {
    expect(computePayoutCents(1000, 2, 50, 25)).toBe(2700);
    expect(computePayoutAmount(1000, 2, 50, 25)).toBe("27.00");
  });

  it("flat fee stacks on top of CPM cap", () => {
    expect(computePayoutCents(1_000_000, 2, 50, 25)).toBe(7500);
    expect(computePayoutAmount(1_000_000, 2, 50, 25)).toBe("75.00");
  });

  it("negative impressions still pay the flat fee", () => {
    expect(computePayoutCents(-100, 4, 75, 25)).toBe(2500);
  });
});

describe("sumNumeric", () => {
  it("sums strings without float drift", () => {
    expect(sumNumeric(["0.10", "0.20", "0.30"])).toBe("0.60");
  });

  it("ignores nulls", () => {
    expect(sumNumeric(["1.00", null, undefined, "2.50"])).toBe("3.50");
  });
});
