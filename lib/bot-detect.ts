// Bot-likeness heuristics for clips. Each sub-score is normalized 0..1;
// composite is a weighted sum. No single signal is decisive on its own —
// real organic clips can occasionally trip one — but together they reliably
// surface the obvious offenders for admin review.
//
// All math is computable from clip_impression_snapshots + the clip's final
// impression count. We do NOT auto-mark anything; this just sorts the
// review queue.

export type Snapshot = {
  clip_id: string;
  impressions: number;
  captured_at: string;
};

export type ClipForScore = {
  id: string;
  clipper_id: string;
  url: string;
  status: "tracking" | "completed" | "rejected";
  impressions: number | null;
  final_impressions: number | null;
  submitted_at: string;
};

export type ClipScore = {
  clipId: string;
  composite: number;
  spike: number;
  concentration: number;
  plateau: number;
  roundness: number;
  // Diagnostic fields for the admin UI / reason text.
  totalGrowth: number;
  biggestHourDelta: number;
  biggestHourAt: string | null;
  medianHourDelta: number;
  hoursPolled: number;
  trailingZeros: number;
  reasonSummary: string;
};

// Bucket boundaries are wall-clock hours (UTC) — small drift across time
// zones is fine since we're looking at gross patterns, not minute-level
// precision.
function hourKey(iso: string): string {
  return iso.slice(0, 13); // "YYYY-MM-DDTHH"
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function trailingZeros(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  let z = 0;
  let cur = Math.floor(n);
  while (cur > 0 && cur % 10 === 0) {
    z++;
    cur = Math.floor(cur / 10);
  }
  return z;
}

export function scoreClip(
  clip: ClipForScore,
  snapshots: Snapshot[],
): ClipScore {
  const total = Number(clip.final_impressions ?? clip.impressions ?? 0);

  // Build per-hour max impression count, then compute the hourly delta.
  // Using "max within hour" instead of "last" guards against minor
  // out-of-order or revised polls.
  const hourMax = new Map<string, { max: number; at: string }>();
  for (const s of snapshots) {
    const k = hourKey(s.captured_at);
    const cur = hourMax.get(k);
    if (!cur || s.impressions > cur.max) {
      hourMax.set(k, { max: s.impressions, at: s.captured_at });
    }
  }
  const hoursSorted = [...hourMax.entries()].sort((a, b) =>
    a[0] < b[0] ? -1 : 1,
  );
  const deltas: Array<{ key: string; delta: number; at: string }> = [];
  let prev = 0;
  for (const [key, { max, at }] of hoursSorted) {
    const d = Math.max(0, max - prev);
    deltas.push({ key, delta: d, at });
    prev = max;
  }

  const positive = deltas.filter((d) => d.delta > 0).map((d) => d.delta);
  const totalGrowth = positive.reduce((s, d) => s + d, 0);
  const med = median(positive);
  const biggest = deltas.reduce(
    (acc, d) => (d.delta > acc.delta ? d : acc),
    { key: "", delta: 0, at: "" },
  );
  const biggestIdx = deltas.findIndex((d) => d === biggest);

  // ── Spike: biggest hour relative to typical hour. Saturates fast on log
  // scale so a 50× spike doesn't dominate the composite.
  let spike = 0;
  if (med > 0 && biggest.delta > 0) {
    const ratio = biggest.delta / med;
    spike = clamp01(Math.log10(Math.max(1, ratio)) / 2); // 1× → 0, 100× → 1
  } else if (biggest.delta > 0 && totalGrowth > 1000) {
    // Median is zero but there's a big spike: treat as max signal.
    spike = 1;
  }

  // ── Concentration: share of total growth from the biggest hour.
  const concentration = totalGrowth > 0
    ? clamp01(biggest.delta / totalGrowth)
    : 0;

  // ── Plateau-after-spike: did growth stop right after the spike?
  // Look at the 3 hours immediately after the biggest hour and check
  // they're ~zero relative to the spike.
  let plateau = 0;
  if (biggestIdx >= 0 && biggest.delta > 0) {
    const after = deltas.slice(biggestIdx + 1, biggestIdx + 4);
    if (after.length > 0) {
      const sumAfter = after.reduce((s, d) => s + d.delta, 0);
      // 0 after a big spike → 1; matching the spike → 0.
      plateau = clamp01(1 - sumAfter / biggest.delta);
    }
  }

  // ── Roundness: trailing zeros on the current/final impression count.
  // 4+ trailing zeros on a >1000 impression clip is a very strong tell
  // for bot-service delivery (10000, 50000, 250000, etc.).
  const tz = trailingZeros(total);
  let roundness = 0;
  if (total >= 1000) {
    if (tz >= 5) roundness = 1;
    else if (tz === 4) roundness = 0.8;
    else if (tz === 3) roundness = 0.35;
  }

  // ── Composite. Concentration is the strongest individual signal; spike
  // is next; plateau and roundness are corroborating. Weights chosen so
  // that any single signal can flag a clip but multiple signals stack.
  const composite = clamp01(
    0.45 * concentration + 0.3 * spike + 0.15 * plateau + 0.1 * roundness,
  );

  const reasonParts: string[] = [];
  if (concentration >= 0.5) {
    reasonParts.push(
      `${Math.round(concentration * 100)}% of views landed in a single hour`,
    );
  }
  if (spike >= 0.5 && med > 0) {
    reasonParts.push(
      `biggest hour was ${Math.round(biggest.delta / Math.max(med, 1))}× the typical hour`,
    );
  }
  if (plateau >= 0.7 && biggest.delta > 0) {
    reasonParts.push("growth flat-lined right after the spike");
  }
  if (roundness >= 0.5) {
    reasonParts.push(`impressions landed at a suspiciously round number (${total.toLocaleString()})`);
  }
  const reasonSummary = reasonParts.length
    ? reasonParts.join("; ")
    : "elevated bot-likeness score across multiple signals";

  return {
    clipId: clip.id,
    composite,
    spike,
    concentration,
    plateau,
    roundness,
    totalGrowth,
    biggestHourDelta: biggest.delta,
    biggestHourAt: biggest.at || null,
    medianHourDelta: med,
    hoursPolled: deltas.length,
    trailingZeros: tz,
    reasonSummary,
  };
}

export type ClipperRollup = {
  clipperId: string;
  clipCount: number;
  suspectCount: number;
  meanScore: number;
  maxScore: number;
  totalImpressions: number;
  sameHourPattern: number; // 0..1 — share of clipper's clips sharing the same biggest-hour-of-day
};

export function rollupByClipper(
  clips: ClipForScore[],
  scoreByClip: Map<string, ClipScore>,
): ClipperRollup[] {
  const groups = new Map<string, ClipForScore[]>();
  for (const c of clips) {
    const cur = groups.get(c.clipper_id) ?? [];
    cur.push(c);
    groups.set(c.clipper_id, cur);
  }
  const out: ClipperRollup[] = [];
  for (const [clipperId, list] of groups) {
    const scored = list
      .map((c) => scoreByClip.get(c.id))
      .filter((s): s is ClipScore => !!s);
    if (scored.length === 0) continue;
    const suspect = scored.filter((s) => s.composite >= 0.5).length;
    const totalImpr = list.reduce(
      (s, c) => s + Number(c.final_impressions ?? c.impressions ?? 0),
      0,
    );
    // Same-hour-of-day pattern: % of this clipper's scored clips whose
    // biggest hour fell on the most common hour-of-day for the clipper.
    const hourCounts = new Map<number, number>();
    for (const s of scored) {
      if (!s.biggestHourAt) continue;
      const h = new Date(s.biggestHourAt).getUTCHours();
      hourCounts.set(h, (hourCounts.get(h) ?? 0) + 1);
    }
    const topHourCount = Math.max(0, ...hourCounts.values());
    const sameHourPattern = scored.length > 0 ? topHourCount / scored.length : 0;
    const mean = scored.reduce((s, x) => s + x.composite, 0) / scored.length;
    const max = scored.reduce((s, x) => Math.max(s, x.composite), 0);
    out.push({
      clipperId,
      clipCount: scored.length,
      suspectCount: suspect,
      meanScore: mean,
      maxScore: max,
      totalImpressions: totalImpr,
      sameHourPattern,
    });
  }
  // Sort by suspect count desc, then by combined mean × clip count.
  out.sort(
    (a, b) =>
      b.suspectCount - a.suspectCount ||
      b.meanScore * b.clipCount - a.meanScore * a.clipCount,
  );
  return out;
}
