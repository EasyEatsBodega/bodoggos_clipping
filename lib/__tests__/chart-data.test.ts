import { describe, expect, it } from "vitest";
import { cumulativeImpressions } from "../chart-data";

const start = new Date("2026-05-01T00:00:00.000Z");
const end = new Date("2026-05-03T00:00:00.000Z");

function snap(clip: string, day: string, impressions: number) {
  return { clip_id: clip, impressions, captured_at: `2026-05-${day}T12:00:00.000Z` };
}

describe("cumulativeImpressions", () => {
  it("reconstructs a running total ending exactly at nowTotal", () => {
    const snaps = [snap("c1", "01", 100), snap("c1", "02", 300), snap("c1", "03", 500)];
    const out = cumulativeImpressions(snaps, start, end, "day", 500);
    expect(out.map((p) => p.value)).toEqual([100, 300, 500]);
    expect(out[out.length - 1].value).toBe(500); // pinned to live total
  });

  it("is monotonically non-decreasing", () => {
    const snaps = [snap("c1", "01", 100), snap("c2", "02", 50), snap("c1", "03", 500)];
    const out = cumulativeImpressions(snaps, start, end, "day", 550);
    for (let i = 1; i < out.length; i++) {
      expect(out[i].value).toBeGreaterThanOrEqual(out[i - 1].value);
    }
    expect(out[out.length - 1].value).toBe(550);
  });

  it("with no nowTotal shows growth relative to 0", () => {
    const snaps = [snap("c1", "01", 100), snap("c1", "02", 300), snap("c1", "03", 500)];
    const out = cumulativeImpressions(snaps, start, end, "day");
    expect(out.map((p) => p.value)).toEqual([0, 200, 400]);
  });

  it("no snapshots → flat at nowTotal", () => {
    const out = cumulativeImpressions([], start, end, "day", 985_576);
    expect(out.every((p) => p.value === 985_576)).toBe(true);
    expect(out.length).toBe(3); // one bucket per day, inclusive
  });

  it("ignores snapshot retractions (takes running max)", () => {
    const snaps = [snap("c1", "01", 100), snap("c1", "02", 80), snap("c1", "03", 200)];
    const out = cumulativeImpressions(snaps, start, end, "day", 200);
    for (let i = 1; i < out.length; i++) {
      expect(out[i].value).toBeGreaterThanOrEqual(out[i - 1].value);
    }
  });
});
