import { describe, expect, it } from "vitest";
import { shouldPoll } from "../poll-cadence";

const HOUR = 3_600_000;

describe("shouldPoll", () => {
  it("polls a brand-new clip with no prior poll", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(
      shouldPoll({ submittedAt: now, lastPolledAt: null, now }),
    ).toBe(true);
  });

  it("at hour 1: polls if last poll was >= 1h ago", () => {
    const now = new Date("2026-01-01T01:00:00Z");
    const submitted = new Date(now.getTime() - HOUR);
    expect(
      shouldPoll({ submittedAt: submitted, lastPolledAt: new Date(now.getTime() - HOUR), now }),
    ).toBe(true);
  });

  it("at hour 1: skips if just polled 10 min ago", () => {
    const now = new Date("2026-01-01T01:00:00Z");
    const submitted = new Date(now.getTime() - HOUR);
    expect(
      shouldPoll({ submittedAt: submitted, lastPolledAt: new Date(now.getTime() - 10 * 60_000), now }),
    ).toBe(false);
  });

  it("at hour 12: needs >= 3h since last poll", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const submitted = new Date(now.getTime() - 12 * HOUR);
    expect(
      shouldPoll({ submittedAt: submitted, lastPolledAt: new Date(now.getTime() - 2 * HOUR), now }),
    ).toBe(false);
    expect(
      shouldPoll({ submittedAt: submitted, lastPolledAt: new Date(now.getTime() - 3 * HOUR), now }),
    ).toBe(true);
  });

  it("at day 3: needs >= 6h since last poll", () => {
    const now = new Date("2026-01-04T00:00:00Z");
    const submitted = new Date(now.getTime() - 3 * 24 * HOUR);
    expect(
      shouldPoll({ submittedAt: submitted, lastPolledAt: new Date(now.getTime() - 5 * HOUR), now }),
    ).toBe(false);
    expect(
      shouldPoll({ submittedAt: submitted, lastPolledAt: new Date(now.getTime() - 6 * HOUR), now }),
    ).toBe(true);
  });
});
