// All money math is integer-cents to avoid float drift, then converted back to numeric strings.

// Total payout = flat fee (per clip) + CPM-based earnings, where the CPM
// portion is capped at maxPerClip. The flat fee is additive on top of the
// cap. This matches per-clipper deals like "$25/clip + $2 CPM cap $50":
// a 0-impression clip pays $25; a million-impression clip pays $25 + $50.
export function computePayoutCents(
  impressions: number,
  cpmRate: number | string,
  maxPerClip: number | string,
  flatFee: number | string = 0,
): number {
  const rateCents = toCents(cpmRate);
  const capCents = toCents(maxPerClip);
  const flatCents = toCents(flatFee);
  if (!Number.isFinite(impressions) || impressions < 0) return flatCents;
  const earned = Math.floor((impressions * rateCents) / 1000);
  return flatCents + Math.min(earned, capCents);
}

export function computePayoutAmount(
  impressions: number,
  cpmRate: number | string,
  maxPerClip: number | string,
  flatFee: number | string = 0,
): string {
  return centsToNumeric(computePayoutCents(impressions, cpmRate, maxPerClip, flatFee));
}

function toCents(v: number | string): number {
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) throw new Error(`invalid money value: ${v}`);
  return Math.round(n * 100);
}

function centsToNumeric(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  return `${sign}${dollars}.${rem.toString().padStart(2, "0")}`;
}

// "Billable" impressions for owed-amount math: completed clips lock in
// their final count, in-flight clips use current impressions, rejected
// clips don't count.
type ClipForOwed = {
  id: string;
  status: "tracking" | "completed" | "rejected";
  impressions: number | null;
  final_impressions: number | null;
  cpm_rate_snapshot: string | number;
  max_payout_snapshot: string | number;
  flat_fee_snapshot: string | number | null;
  botting_suspected?: boolean | null;
};

export function billableImpressions(c: ClipForOwed): number {
  if (c.status === "rejected") return 0;
  // Clips flagged as suspected engagement farming stay in the system but
  // do not contribute to payouts.
  if (c.botting_suspected) return 0;
  if (c.status === "completed") return Number(c.final_impressions ?? c.impressions ?? 0);
  return Number(c.impressions ?? 0);
}

// Rolling owed amount for a clipper, in cents. For each clip we compute
// total earnings up to the current billable impression count and subtract
// what was already implicitly paid up to the latest watermark — i.e. the
// payout_clip_marks row with the highest impressions_at_mark for that
// clip. The CPM cap is applied inside computePayoutCents at both ends, so
// once a clip is capped further views correctly contribute zero.
//
// The watermark is per-clip. Clips with no marks yet are treated as if the
// last watermark were zero impressions, so the first payout naturally
// sweeps in the flat fee and all CPM earnings to date.
export function computeRollingOwedCents(
  clips: ClipForOwed[],
  marksByClipId: Map<string, number>,
): number {
  let total = 0;
  for (const c of clips) {
    if (c.status === "rejected") continue;
    if (c.botting_suspected) continue;
    const nowImpressions = billableImpressions(c);
    const earnedNow = computePayoutCents(
      nowImpressions,
      c.cpm_rate_snapshot,
      c.max_payout_snapshot,
      c.flat_fee_snapshot ?? 0,
    );
    // "No mark yet" (clip never appeared in a prior payout) means nothing
    // has been paid for this clip, so earnedAtMark = 0 and the first
    // payout sweeps in the flat fee. A present mark — even at 0
    // impressions — means the flat fee was already paid and we should
    // only owe the CPM growth above the watermark.
    const earnedAtMark = marksByClipId.has(c.id)
      ? computePayoutCents(
          marksByClipId.get(c.id) ?? 0,
          c.cpm_rate_snapshot,
          c.max_payout_snapshot,
          c.flat_fee_snapshot ?? 0,
        )
      : 0;
    total += Math.max(0, earnedNow - earnedAtMark);
  }
  return total;
}

// Builds Map<clip_id, latest_impressions_at_mark> from a flat list of
// payout_clip_marks rows. Used by both server pages and pay routes.
export function latestMarksByClipId(
  marks: Array<{ clip_id: string; impressions_at_mark: number }>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of marks) {
    const cur = out.get(m.clip_id);
    if (cur == null || m.impressions_at_mark > cur) {
      out.set(m.clip_id, m.impressions_at_mark);
    }
  }
  return out;
}

export function sumNumeric(values: Array<string | number | null | undefined>): string {
  let cents = 0;
  for (const v of values) {
    if (v == null) continue;
    cents += toCents(v as number | string);
  }
  return centsToNumeric(cents);
}
