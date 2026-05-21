import { describe, expect, it } from "vitest";
import {
  computePayoutAmount,
  computePayoutCents,
  computeRollingOwedCents,
  latestMarksByClipId,
  sumNumeric,
} from "../payout-calc";

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

// Locks the production BoDoggos Streams config: $4 CPM, $75 cap, no flat fee.
// The CPM-earned portion must never exceed $75.00 regardless of impressions.
describe("$75 cap invariant (production config)", () => {
  const CPM = 4;
  const CAP = 75;

  it("caps exactly at the impression count that reaches $75", () => {
    // $75 / $4 per 1k = 18,750 impressions to hit the cap.
    expect(computePayoutAmount(18_750, CPM, CAP)).toBe("75.00");
  });

  it("one impression below the cap is still under $75", () => {
    expect(computePayoutCents(18_749, CPM, CAP)).toBe(7499);
  });

  it("never exceeds $75 across a wide range of impressions", () => {
    for (const imps of [18_751, 20_000, 100_000, 1_000_000, 50_000_000, 999_999_999]) {
      expect(computePayoutCents(imps, CPM, CAP)).toBeLessThanOrEqual(7500);
      expect(computePayoutAmount(imps, CPM, CAP)).toBe("75.00");
    }
  });

  it("string-typed snapshots (as stored in the DB) cap identically", () => {
    expect(computePayoutAmount(1_000_000, "4.00", "75.00", "0")).toBe("75.00");
  });
});

describe("computeRollingOwedCents", () => {
  const baseClip = {
    cpm_rate_snapshot: "4",
    max_payout_snapshot: "75",
    flat_fee_snapshot: "0" as string | null,
  };

  it("no marks → owed equals total earned to date", () => {
    const clips = [
      { ...baseClip, id: "c1", status: "tracking" as const, impressions: 1000, final_impressions: null },
      { ...baseClip, id: "c2", status: "completed" as const, impressions: 0, final_impressions: 5000 },
    ];
    // c1: 1000 * $4/1000 = $4. c2: 5000 * $4/1000 = $20. total $24 → 2400 cents.
    expect(computeRollingOwedCents(clips, new Map())).toBe(2400);
  });

  it("mark at current impressions → owed is 0", () => {
    const clips = [
      { ...baseClip, id: "c1", status: "tracking" as const, impressions: 1000, final_impressions: null },
    ];
    expect(computeRollingOwedCents(clips, new Map([["c1", 1000]]))).toBe(0);
  });

  it("mark below current → owed is the delta only", () => {
    const clips = [
      { ...baseClip, id: "c1", status: "tracking" as const, impressions: 3000, final_impressions: null },
    ];
    // earned at 3000 = 1200, earned at 1000 = 400, delta = 800.
    expect(computeRollingOwedCents(clips, new Map([["c1", 1000]]))).toBe(800);
  });

  it("rejected clips contribute zero", () => {
    const clips = [
      { ...baseClip, id: "c1", status: "rejected" as const, impressions: 50000, final_impressions: null },
    ];
    expect(computeRollingOwedCents(clips, new Map())).toBe(0);
  });

  it("CPM cap holds across mark and now → no extra owed past the cap", () => {
    const clips = [
      // Already past cap at the mark; new impressions don't add more.
      { ...baseClip, id: "c1", status: "tracking" as const, impressions: 5_000_000, final_impressions: null },
    ];
    expect(computeRollingOwedCents(clips, new Map([["c1", 1_000_000]]))).toBe(0);
  });

  it("flat fee paid only on first payout, not double-counted", () => {
    const clips = [
      {
        ...baseClip,
        flat_fee_snapshot: "25" as string | null,
        id: "c1",
        status: "tracking" as const,
        impressions: 2000,
        final_impressions: null,
      },
    ];
    // First payout, mark = 0 → owed = $25 + $8 = $33 → 3300.
    expect(computeRollingOwedCents(clips, new Map())).toBe(3300);
    // After mark at 2000, additional 1000 impressions → owed = $4 = 400.
    const after = [{ ...clips[0], impressions: 3000 }];
    expect(computeRollingOwedCents(after, new Map([["c1", 2000]]))).toBe(400);
  });
});

describe("latestMarksByClipId", () => {
  it("keeps the highest watermark per clip", () => {
    const result = latestMarksByClipId([
      { clip_id: "c1", impressions_at_mark: 1000 },
      { clip_id: "c1", impressions_at_mark: 3000 },
      { clip_id: "c1", impressions_at_mark: 2000 },
      { clip_id: "c2", impressions_at_mark: 500 },
    ]);
    expect(result.get("c1")).toBe(3000);
    expect(result.get("c2")).toBe(500);
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
