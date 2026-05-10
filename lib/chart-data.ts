// Aggregation helpers for the admin overview charts. Buckets datasets
// into daily UTC dates and returns shapes ready for Recharts.

export type DailyPoint = {
  date: string; // YYYY-MM-DD
  value: number;
};

// Inclusive day range, ascending. Used to fill zero-buckets so charts
// don't visually compress days where nothing happened.
export function dateRange(start: Date, end: Date): string[] {
  const out: string[] = [];
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const stop = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (cur.getTime() <= stop.getTime()) {
    out.push(toYmd(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
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
): DailyPoint[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const d = getDate(r);
    if (!d) continue;
    const day = toYmd(d);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return dateRange(start, end).map((date) => ({ date, value: counts.get(date) ?? 0 }));
}

// Sums numeric values grouped by UTC day. Used for "payouts per day".
export function bucketSum<T>(
  rows: T[],
  getDate: (row: T) => string | null | undefined,
  getValue: (row: T) => number | string | null | undefined,
  start: Date,
  end: Date,
): DailyPoint[] {
  const sums = new Map<string, number>();
  for (const r of rows) {
    const d = getDate(r);
    if (!d) continue;
    const day = toYmd(d);
    const v = Number(getValue(r) ?? 0);
    sums.set(day, (sums.get(day) ?? 0) + (Number.isFinite(v) ? v : 0));
  }
  return dateRange(start, end).map((date) => ({ date, value: sums.get(date) ?? 0 }));
}

// Cumulative impressions per day across a clip's snapshots. For each day
// d in the range, value = sum across clips of (max snapshot.impressions
// captured on or before end of d). Produces a monotonically non-decreasing
// growth curve. Clips that finalize before the range starts still
// contribute their final impressions to the base.
export function cumulativeImpressions(
  snapshots: Array<{ clip_id: string; impressions: number; captured_at: string }>,
  start: Date,
  end: Date,
): DailyPoint[] {
  // Sort once, then walk forward day by day.
  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime(),
  );

  const days = dateRange(start, end);
  // Running latest-snapshot-per-clip view.
  const latestByClip = new Map<string, number>();
  let cursor = 0;
  const out: DailyPoint[] = [];

  for (const day of days) {
    const dayEnd = new Date(`${day}T23:59:59.999Z`).getTime();
    while (cursor < sorted.length && new Date(sorted[cursor].captured_at).getTime() <= dayEnd) {
      const s = sorted[cursor++];
      const prev = latestByClip.get(s.clip_id) ?? 0;
      // Snapshots should be monotonically increasing, but guard against
      // any retraction noise by taking the max.
      if (s.impressions > prev) latestByClip.set(s.clip_id, s.impressions);
    }
    let total = 0;
    for (const v of latestByClip.values()) total += v;
    out.push({ date: day, value: total });
  }
  return out;
}
