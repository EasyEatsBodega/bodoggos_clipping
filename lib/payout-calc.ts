// All money math is integer-cents to avoid float drift, then converted back to numeric strings.

// Total payout = flat fee (per clip) + CPM-based earnings, where the CPM
// portion is capped at maxPerClip. The flat fee is additive on top of the
// cap. This matches per-clipper deals like "$25/clip + $2 CPM cap $50":
// a 0-impression clip pays $25; a million-impression clip pays $25 + $50.
//
// Weekly-base campaigns (campaigns.weekly_base_pay_usd) reuse the same
// field: the clip-submit route snapshots the campaign's weekly base as the
// flat fee on the FIRST counting clip of each ET week (0 on the rest), so
// the base flows through finalize / owed / tax / budget with no special
// cases here. A cpm rate of 0 in those campaigns means impressions are
// tracked but earn nothing on top of the base.
//
// The sponsored-post bonus (campaigns.sponsored_bonus_usd) is folded into
// the same flat fee when a clip carries the "sponsored" tag; the clip's
// sponsored_bonus_snapshot records that component (lib/sponsored.ts).
//
// minViews is a per-campaign eligibility floor: a clip below it earns
// nothing at all (not even the flat fee) until it crosses the threshold.
// Once eligible, CPM applies from the first view — the floor is a gate,
// not a deductible. minViews <= 0 (the default) means no floor.
export function computePayoutCents(
  impressions: number,
  cpmRate: number | string,
  maxPerClip: number | string,
  flatFee: number | string = 0,
  minViews = 0,
): number {
  const rateCents = toCents(cpmRate);
  const capCents = toCents(maxPerClip);
  const flatCents = toCents(flatFee);
  if (!Number.isFinite(impressions) || impressions < 0) return flatCents;
  if (minViews > 0 && impressions < minViews) return 0;
  const earned = Math.floor((impressions * rateCents) / 1000);
  return flatCents + Math.min(earned, capCents);
}

export function computePayoutAmount(
  impressions: number,
  cpmRate: number | string,
  maxPerClip: number | string,
  flatFee: number | string = 0,
  minViews = 0,
): string {
  return centsToNumeric(computePayoutCents(impressions, cpmRate, maxPerClip, flatFee, minViews));
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
  min_views_snapshot?: number | null;
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
// A payout watermark for one clip: the billable impressions at the time of
// the payout plus, for marks taken after migration 0026, the flat amount
// the ledger considered paid then. flatFee null = legacy mark: assume the
// clip's current flat fee was already paid (the pre-0026 behaviour).
export type ClipMark = { impressions: number; flatFee: number | null };

export function computeRollingOwedCents(
  clips: ClipForOwed[],
  marksByClipId: Map<string, number | ClipMark>,
): number {
  let total = 0;
  for (const c of clips) {
    if (c.status === "rejected") continue;
    if (c.botting_suspected) continue;
    const nowImpressions = billableImpressions(c);
    const minViews = Number(c.min_views_snapshot ?? 0);
    const flatNow = c.flat_fee_snapshot ?? 0;
    const earnedNow = computePayoutCents(
      nowImpressions,
      c.cpm_rate_snapshot,
      c.max_payout_snapshot,
      flatNow,
      minViews,
    );
    // "No mark yet" (clip never appeared in a prior payout) means nothing
    // has been paid for this clip, so earnedAtMark = 0 and the first
    // payout sweeps in the flat fee. A present mark means the flat amount
    // recorded on it (or, for legacy marks, the current one) was already
    // paid, so we owe only the CPM growth above the watermark plus any flat
    // amount added since — e.g. a sponsored bonus tagged after payday.
    // Clamped at zero per clip: a flat amount removed after it was paid is
    // netted against that clip's future earnings, never clawed back.
    const raw = marksByClipId.get(c.id);
    const mark: ClipMark | null =
      raw == null ? null : typeof raw === "number" ? { impressions: raw, flatFee: null } : raw;
    const earnedAtMark = mark
      ? computePayoutCents(
          mark.impressions,
          c.cpm_rate_snapshot,
          c.max_payout_snapshot,
          mark.flatFee ?? flatNow,
          minViews,
        )
      : 0;
    total += Math.max(0, earnedNow - earnedAtMark);
  }
  return total;
}

// Builds Map<clip_id, ClipMark> from a flat list of payout_clip_marks rows:
// per clip, the mark with the highest impressions (conservative — a later
// mark taken while the clip was botting-suspected sits at 0 and must not
// reopen already-paid views). On a tie the most recent mark wins, so a
// payout that settled a later-added flat amount (sponsored bonus) at the
// same impression count is the one trusted. Used by server pages and pay
// routes.
export function latestMarksByClipId(
  marks: Array<{
    clip_id: string;
    impressions_at_mark: number;
    flat_fee_at_mark?: string | number | null;
    created_at?: string | null;
  }>,
): Map<string, ClipMark> {
  const best = new Map<string, { mark: ClipMark; createdAt: number }>();
  for (const m of marks) {
    const createdAt = m.created_at ? new Date(m.created_at).getTime() : 0;
    const flatFee = m.flat_fee_at_mark == null ? null : Number(m.flat_fee_at_mark);
    const cur = best.get(m.clip_id);
    const wins =
      cur == null ||
      m.impressions_at_mark > cur.mark.impressions ||
      (m.impressions_at_mark === cur.mark.impressions && createdAt > cur.createdAt);
    if (wins) {
      best.set(m.clip_id, {
        mark: { impressions: m.impressions_at_mark, flatFee },
        createdAt,
      });
    }
  }
  const out = new Map<string, ClipMark>();
  for (const [id, b] of best) out.set(id, b.mark);
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
