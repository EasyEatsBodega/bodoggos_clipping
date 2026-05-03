// All money math is integer-cents to avoid float drift, then converted back to numeric strings.

export function computePayoutCents(
  impressions: number,
  cpmRate: number | string,
  maxPerClip: number | string,
): number {
  const rateCents = toCents(cpmRate);
  const capCents = toCents(maxPerClip);
  if (!Number.isFinite(impressions) || impressions < 0) return 0;
  // (impressions / 1000) * rateCents → integer cents, rounded down
  const earned = Math.floor((impressions * rateCents) / 1000);
  return Math.min(earned, capCents);
}

export function computePayoutAmount(
  impressions: number,
  cpmRate: number | string,
  maxPerClip: number | string,
): string {
  return centsToNumeric(computePayoutCents(impressions, cpmRate, maxPerClip));
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
