import type { SupabaseClient } from "@supabase/supabase-js";
import { billableImpressions, computePayoutAmount, sumNumeric } from "./payout-calc";
import {
  computeTaxStatus,
  currentTaxYear,
  earnedCentsInYear,
  paidCentsInYear,
  payoutBlocked,
} from "./tax-compliance";

export type TaxComplianceState = "needs_submission" | "awaiting_clearance" | "cleared";

export type TaxComplianceRow = {
  clipperId: string;
  xHandle: string;
  accountEmail: string;
  earnedCents: number;
  state: TaxComplianceState;
  legalName: string | null;
  country: string | null;
  taxEmail: string | null;
  submittedAt: string | null;
  clearedAt: string | null;
};

// Every clipper relevant to tax compliance for a year: those who have reached
// the $600 threshold and/or have submitted tax info. Sorted so the ones that
// need action (submission, then clearance) come first.
export async function getTaxComplianceRows(
  supabase: SupabaseClient,
  year: number,
): Promise<TaxComplianceRow[]> {
  const [{ data: clippers }, { data: clips }, { data: infos }] = await Promise.all([
    supabase.from("clippers").select("id, x_handle, email"),
    supabase.from("clips").select("clipper_id, status, payout_amount, tracking_until"),
    supabase.from("clipper_tax_info").select("*").eq("tax_year", year),
  ]);

  const clipsByClipper = new Map<string, typeof clips>();
  for (const c of clips ?? []) {
    const arr = clipsByClipper.get(c.clipper_id) ?? [];
    arr.push(c);
    clipsByClipper.set(c.clipper_id, arr);
  }
  const infoByClipper = new Map<string, NonNullable<typeof infos>[number]>();
  for (const i of infos ?? []) infoByClipper.set(i.clipper_id, i);

  const rows: TaxComplianceRow[] = [];
  for (const cl of clippers ?? []) {
    const info = infoByClipper.get(cl.id) ?? null;
    const earnedCents = earnedCentsInYear(clipsByClipper.get(cl.id) ?? [], year);
    const status = computeTaxStatus(earnedCents, info, year);
    if (!status.thresholdReached && !info) continue;
    rows.push({
      clipperId: cl.id,
      xHandle: cl.x_handle,
      accountEmail: cl.email,
      earnedCents,
      state: status.cleared
        ? "cleared"
        : status.submitted
          ? "awaiting_clearance"
          : "needs_submission",
      legalName: info ? `${info.legal_first_name} ${info.legal_last_name}` : null,
      country: info?.country ?? null,
      taxEmail: info?.email ?? null,
      submittedAt: info?.submitted_at ?? null,
      clearedAt: info?.cleared_at ?? null,
    });
  }

  const order: Record<TaxComplianceState, number> = {
    needs_submission: 0,
    awaiting_clearance: 1,
    cleared: 2,
  };
  rows.sort((a, b) => order[a.state] - order[b.state] || b.earnedCents - a.earnedCents);
  return rows;
}

// Returns whether a payout to this clipper must be blocked for tax compliance
// (they've reached the $600/year threshold and aren't cleared). Used by both
// payout-recording endpoints. Uses a service-role client.
export async function checkPayoutTaxHold(
  supabase: SupabaseClient,
  clipperId: string,
  payoutAmount: number,
): Promise<{ blocked: boolean; reason?: string }> {
  const year = currentTaxYear();
  const [{ data: clips }, { data: payouts }, { data: info }] = await Promise.all([
    supabase
      .from("clips")
      .select("status, payout_amount, tracking_until")
      .eq("clipper_id", clipperId),
    supabase.from("payouts").select("amount, paid_at").eq("clipper_id", clipperId),
    supabase
      .from("clipper_tax_info")
      .select("cleared_at")
      .eq("clipper_id", clipperId)
      .eq("tax_year", year)
      .maybeSingle(),
  ]);

  const cleared = info?.cleared_at != null;
  const blocked = payoutBlocked({
    earnedCents: earnedCentsInYear(clips ?? [], year),
    paidCentsThisYear: paidCentsInYear(payouts ?? [], year),
    payoutCents: Math.round(payoutAmount * 100),
    cleared,
  });
  if (!blocked) return { blocked: false };

  const reason = info
    ? `payment on hold: clipper has reached the $600 tax threshold for ${year} and is awaiting tax clearance`
    : `payment on hold: clipper has reached the $600 tax threshold for ${year} and must submit tax info before being paid`;
  return { blocked: true, reason };
}

// Returns every campaign that is admin-flagged active AND inside its date
// window (if one is set). Sorted newest-first so freshly created campaigns
// surface to clippers immediately.
export async function getActiveCampaigns(supabase: SupabaseClient) {
  const nowIso = new Date().toISOString();
  const { data } = await supabase
    .from("campaigns")
    .select("*")
    .eq("active", true)
    .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
    .or(`ends_at.is.null,ends_at.gte.${nowIso}`)
    .order("created_at", { ascending: false });
  return data ?? [];
}

// True if campaign is admin-active AND current time is inside any configured
// start/end window. Used by clip-submit + enrollment endpoints.
export function isCampaignOpen(campaign: {
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
}): boolean {
  if (!campaign.active) return false;
  const now = Date.now();
  if (campaign.starts_at && new Date(campaign.starts_at).getTime() > now) return false;
  if (campaign.ends_at && new Date(campaign.ends_at).getTime() < now) return false;
  return true;
}

// Sums the dollar value already "spent" on a campaign, counting completed
// clips at their finalized payout_amount and tracking clips at their current
// projected payout (impressions × cpm capped at max). Used to enforce
// budget_usd at submit time.
export async function getCampaignSpend(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<number> {
  const { data: clips } = await supabase
    .from("clips")
    .select(
      "status, impressions, final_impressions, payout_amount, cpm_rate_snapshot, max_payout_snapshot, flat_fee_snapshot, min_views_snapshot",
    )
    .eq("campaign_id", campaignId)
    .neq("status", "rejected");
  if (!clips || clips.length === 0) return 0;
  let total = 0;
  for (const c of clips) {
    if (c.payout_amount != null) {
      total += Number(c.payout_amount);
      continue;
    }
    const imps = Number(c.final_impressions ?? c.impressions ?? 0);
    total += Number(
      computePayoutAmount(
        imps,
        Number(c.cpm_rate_snapshot ?? 0),
        Number(c.max_payout_snapshot ?? 0),
        Number(c.flat_fee_snapshot ?? 0),
        Number(c.min_views_snapshot ?? 0),
      ),
    );
  }
  return total;
}

export type ClipperKpis = {
  totalClips: number;
  totalImpressions: number;
  totalEarned: string;
  totalPaid: string;
  outstanding: string;
};

export async function getClipperKpis(
  supabase: SupabaseClient,
  clipperId: string,
): Promise<ClipperKpis> {
  const [{ data: clips }, { data: payouts }] = await Promise.all([
    supabase
      .from("clips")
      .select("impressions, final_impressions, payout_amount, status")
      .eq("clipper_id", clipperId),
    supabase.from("payouts").select("amount").eq("clipper_id", clipperId),
  ]);

  const totalClips = clips?.length ?? 0;
  const totalImpressions =
    clips?.reduce(
      (s, c) => s + Number(c.final_impressions ?? c.impressions ?? 0),
      0,
    ) ?? 0;
  const totalEarned = sumNumeric(clips?.map((c) => c.payout_amount) ?? []);
  const totalPaid = sumNumeric(payouts?.map((p) => p.amount) ?? []);
  const outstanding = (() => {
    const earnedCents = Math.round(Number(totalEarned) * 100);
    const paidCents = Math.round(Number(totalPaid) * 100);
    const cents = Math.max(0, earnedCents - paidCents);
    const dollars = Math.floor(cents / 100);
    const rem = cents % 100;
    return `${dollars}.${rem.toString().padStart(2, "0")}`;
  })();

  return { totalClips, totalImpressions, totalEarned, totalPaid, outstanding };
}

// Snapshots the current billable impression count for every non-rejected
// clip belonging to a clipper as a payout_clip_marks row attached to the
// just-inserted payout. The next "rolling owed" calc will only count
// impressions above these watermarks. Errors are swallowed (logged) — the
// payment is the source of truth, marks are an accounting refinement; if
// they fail the next payout will overpay slightly rather than block a
// confirmed transfer from being recorded.
export async function snapshotClipMarks(
  supabase: SupabaseClient,
  payoutId: string,
  clipperId: string,
): Promise<void> {
  const { data: clips, error } = await supabase
    .from("clips")
    .select("id, status, impressions, final_impressions")
    .eq("clipper_id", clipperId)
    .neq("status", "rejected");
  if (error || !clips) {
    console.error("snapshotClipMarks: failed to read clips", error);
    return;
  }
  if (clips.length === 0) return;

  const rows = clips.map((c) => ({
    payout_id: payoutId,
    clip_id: c.id,
    impressions_at_mark: billableImpressions({
      id: c.id,
      status: c.status,
      impressions: c.impressions,
      final_impressions: c.final_impressions,
      cpm_rate_snapshot: 0,
      max_payout_snapshot: 0,
      flat_fee_snapshot: 0,
    }),
  }));
  const { error: insErr } = await supabase
    .from("payout_clip_marks")
    .insert(rows);
  if (insErr) {
    console.error("snapshotClipMarks: failed to insert marks", insErr);
  }
}
