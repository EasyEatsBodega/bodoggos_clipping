// Tax compliance: clippers who earn $600+ in a calendar year must submit
// legal name + country and be cleared by an admin before they can be paid.
// All money math is integer cents. The threshold resets each calendar year.

export const TAX_THRESHOLD_CENTS = 60_000; // $600.00

export function currentTaxYear(now: Date = new Date()): number {
  return now.getUTCFullYear();
}

type ClipForTax = {
  status: string;
  payout_amount: string | number | null;
  tracking_until: string | null;
};

// Finalized earnings attributed to a calendar year by the clip's completion
// (tracking_until). Tracking clips aren't counted until they finalize.
export function earnedCentsInYear(clips: ClipForTax[], year: number): number {
  let cents = 0;
  for (const c of clips) {
    if (c.status !== "completed" || c.payout_amount == null) continue;
    if (!c.tracking_until) continue;
    if (new Date(c.tracking_until).getUTCFullYear() !== year) continue;
    cents += Math.round(Number(c.payout_amount) * 100);
  }
  return cents;
}

type PayoutForTax = { amount: string | number; paid_at: string };

export function paidCentsInYear(payouts: PayoutForTax[], year: number): number {
  let cents = 0;
  for (const p of payouts) {
    if (!p.paid_at) continue;
    if (new Date(p.paid_at).getUTCFullYear() !== year) continue;
    cents += Math.round(Number(p.amount) * 100);
  }
  return cents;
}

export type TaxInfo = {
  legal_first_name: string | null;
  legal_last_name: string | null;
  country: string | null;
  email: string | null;
  submitted_at: string | null;
  cleared_at: string | null;
  requested_at: string | null;
} | null;

export type TaxStatus = {
  year: number;
  earnedCents: number;
  thresholdReached: boolean;
  requested: boolean; // an admin asked them to submit
  submitted: boolean;
  cleared: boolean;
  needsSubmission: boolean; // clipper must fill out the form
  awaitingClearance: boolean; // submitted, waiting on admin
  paymentHold: boolean; // payments blocked until cleared
};

export function computeTaxStatus(
  earnedCents: number,
  info: TaxInfo,
  year: number,
): TaxStatus {
  const thresholdReached = earnedCents >= TAX_THRESHOLD_CENTS;
  const requested = info?.requested_at != null;
  const submitted = info?.submitted_at != null;
  const cleared = info?.cleared_at != null;
  return {
    year,
    earnedCents,
    thresholdReached,
    requested,
    submitted,
    cleared,
    // The clipper sees the form once they cross $600 OR an admin requests it.
    needsSubmission: (thresholdReached || requested) && !submitted,
    awaitingClearance: submitted && !cleared,
    // The hard payment gate stays tied to the legal $600 threshold.
    paymentHold: thresholdReached && !cleared,
  };
}

// Whether recording a payout must be blocked: the clipper has reached the
// year's $600 threshold (by earnings) OR this payout would push their
// year-to-date paid total over $600, and they are not cleared.
export function payoutBlocked(opts: {
  earnedCents: number;
  paidCentsThisYear: number;
  payoutCents: number;
  cleared: boolean;
}): boolean {
  if (opts.cleared) return false;
  const reachedByEarnings = opts.earnedCents >= TAX_THRESHOLD_CENTS;
  const reachedByPayment = opts.paidCentsThisYear + opts.payoutCents > TAX_THRESHOLD_CENTS;
  return reachedByEarnings || reachedByPayment;
}
