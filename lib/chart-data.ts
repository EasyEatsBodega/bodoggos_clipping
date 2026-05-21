// Aggregation helpers for the admin overview charts. Buckets datasets
// into daily UTC dates and returns shapes ready for Recharts.

export type DailyPoint = {
  date: string; // bucket key: "YYYY-MM-DD" (day) or ISO hour (hour)
  value: number;
};

export type Granularity = "hour" | "day";

// Bucket key for a moment at the given granularity. Day keys are "YYYY-MM-DD";
// hour keys are the ISO timestamp of the start of the UTC hour.
function keyOf(d: Date | string, g: Granularity): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  if (g === "hour") {
    return new Date(
      Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), dt.getUTCHours()),
    ).toISOString();
  }
  return toYmd(dt);
}

// Inclusive bucket range, ascending. Used to fill zero-buckets so charts
// don't visually compress periods where nothing happened.
export function dateRange(start: Date, end: Date, g: Granularity = "day"): string[] {
  const out: string[] = [];
  if (g === "hour") {
    const cur = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), start.getUTCHours()),
    );
    const stop = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate(), end.getUTCHours()),
    );
    while (cur.getTime() <= stop.getTime()) {
      out.push(cur.toISOString());
      cur.setUTCHours(cur.getUTCHours() + 1);
    }
    return out;
  }
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const stop = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (cur.getTime() <= stop.getTime()) {
    out.push(toYmd(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

// Inclusive end-of-bucket epoch ms for a bucket key, so we can decide which
// snapshots fall on or before a given bucket.
function bucketEndMs(key: string, g: Granularity): number {
  if (g === "hour") return new Date(key).getTime() + 3_599_999;
  return new Date(`${key}T23:59:59.999Z`).getTime();
}

export function toYmd(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const day = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Counts rows grouped by the UTC day of `getDate(row)`. Fills missing
// days with 0 across the full [start, end] range so the chart x-axis is
// continuous.
export function bucketCount<T>(
  rows: T[],
  getDate: (row: T) => string | null | undefined,
  start: Date,
  end: Date,
  g: Granularity = "day",
): DailyPoint[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const d = getDate(r);
    if (!d) continue;
    const key = keyOf(d, g);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return dateRange(start, end, g).map((date) => ({ date, value: counts.get(date) ?? 0 }));
}

// Sums numeric values grouped by bucket. Used for "payouts per day".
export function bucketSum<T>(
  rows: T[],
  getDate: (row: T) => string | null | undefined,
  getValue: (row: T) => number | string | null | undefined,
  start: Date,
  end: Date,
  g: Granularity = "day",
): DailyPoint[] {
  const sums = new Map<string, number>();
  for (const r of rows) {
    const d = getDate(r);
    if (!d) continue;
    const key = keyOf(d, g);
    const v = Number(getValue(r) ?? 0);
    sums.set(key, (sums.get(key) ?? 0) + (Number.isFinite(v) ? v : 0));
  }
  return dateRange(start, end, g).map((date) => ({ date, value: sums.get(date) ?? 0 }));
}

// Cumulative impressions across clips, bucketed at the given granularity,
// reconstructed from IN-WINDOW snapshots plus the live current total.
//
// We deliberately do NOT require the full snapshot history (that table grows
// unbounded with hourly polling and scanning it on every page load times
// out). Instead: each clip's growth *within the window* is (latest in-window
// snapshot - earliest in-window snapshot). The window-start base is then
// nowTotal - (sum of in-window growth), so the curve starts at the true
// total-at-window-start, climbs with in-window snapshots, and ends exactly at
// nowTotal (the current live total). Clips with no in-window snapshot simply
// sit in the base.
//
// If nowTotal is omitted the curve is relative (starts at 0) — still monotonic.
export function cumulativeImpressions(
  snapshots: Array<{ clip_id: string; impressions: number; captured_at: string }>,
  start: Date,
  end: Date,
  g: Granularity = "day",
  nowTotal?: number,
): DailyPoint[] {
  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime(),
  );

  // Per-clip earliest (baseline) and latest in-window value.
  const baseline = new Map<string, number>();
  const finalVal = new Map<string, number>();
  for (const s of sorted) {
    if (!baseline.has(s.clip_id)) baseline.set(s.clip_id, s.impressions);
    finalVal.set(s.clip_id, Math.max(finalVal.get(s.clip_id) ?? 0, s.impressions));
  }
  let totalGrowth = 0;
  for (const [clip, fin] of finalVal) totalGrowth += fin - (baseline.get(clip) ?? 0);
  const baseTotal = Math.max(0, (nowTotal ?? totalGrowth) - totalGrowth);

  const buckets = dateRange(start, end, g);
  const latest = new Map<string, number>(); // running latest per clip, seeded to baseline
  let cursor = 0;
  let growthSoFar = 0;
  const out: DailyPoint[] = [];

  for (const key of buckets) {
    const endMs = bucketEndMs(key, g);
    while (cursor < sorted.length && new Date(sorted[cursor].captured_at).getTime() <= endMs) {
      const s = sorted[cursor++];
      const base = baseline.get(s.clip_id) ?? s.impressions;
      const prev = latest.get(s.clip_id) ?? base;
      const next = Math.max(prev, s.impressions);
      growthSoFar += next - prev;
      latest.set(s.clip_id, next);
    }
    out.push({ date: key, value: baseTotal + growthSoFar });
  }

  if (nowTotal != null && out.length > 0) {
    const last = out[out.length - 1];
    out[out.length - 1] = { date: last.date, value: Math.max(last.value, nowTotal) };
  }
  return out;
}
