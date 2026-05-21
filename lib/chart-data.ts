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

// Cumulative impressions across a clip's snapshots, bucketed at the given
// granularity. For each bucket b in the range, value = sum across clips of
// (max snapshot.impressions captured on or before the end of b). Produces a
// monotonically non-decreasing growth curve. Snapshots captured before the
// range start fold into the first bucket, so clips that finalized earlier
// still contribute their impressions to the base.
//
// nowTotal, if provided, overrides the final bucket with the live current
// total (e.g. the sum of each clip's current impression count) so the right
// edge reflects this moment rather than the latest stored snapshot.
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

  const buckets = dateRange(start, end, g);
  // Running latest-snapshot-per-clip view.
  const latestByClip = new Map<string, number>();
  let cursor = 0;
  const out: DailyPoint[] = [];

  for (const key of buckets) {
    const endMs = bucketEndMs(key, g);
    while (cursor < sorted.length && new Date(sorted[cursor].captured_at).getTime() <= endMs) {
      const s = sorted[cursor++];
      const prev = latestByClip.get(s.clip_id) ?? 0;
      // Snapshots should be monotonically increasing, but guard against
      // any retraction noise by taking the max.
      if (s.impressions > prev) latestByClip.set(s.clip_id, s.impressions);
    }
    let total = 0;
    for (const v of latestByClip.values()) total += v;
    out.push({ date: key, value: total });
  }

  if (nowTotal != null && out.length > 0) {
    const last = out[out.length - 1];
    out[out.length - 1] = { date: last.date, value: Math.max(last.value, nowTotal) };
  }
  return out;
}
