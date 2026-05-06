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

export function sumNumeric(values: Array<string | number | null | undefined>): string {
  let cents = 0;
  for (const v of values) {
    if (v == null) continue;
    cents += toCents(v as number | string);
  }
  return centsToNumeric(cents);
}
