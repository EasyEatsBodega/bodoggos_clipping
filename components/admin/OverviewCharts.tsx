"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailyPoint, Granularity } from "@/lib/chart-data";

export function OverviewCharts({
  impressions,
  clipsSubmitted,
  newClippersPerDay,
  avgPerClip,
  granularity = "day",
}: {
  impressions: DailyPoint[];
  clipsSubmitted: DailyPoint[];
  newClippersPerDay: DailyPoint[];
  avgPerClip: DailyPoint[];
  granularity?: Granularity;
}) {
  const per = granularity === "hour" ? "per hour" : "per day";
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <ChartCard title="impressions over time" subtitle="running total across all matching clips">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={impressions} margin={chartMargin}>
            <defs>
              <linearGradient id="grad-impressions" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--admin)" stopOpacity={0.5} />
                <stop offset="100%" stopColor="var(--admin)" stopOpacity={0} />
              </linearGradient>
            </defs>
            {commonAxes(impressions)}
            <Tooltip {...tooltipProps} labelFormatter={tooltipLabelFmt} formatter={(v) => fmtInt(Number(v))} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--admin)"
              strokeWidth={1.5}
              fill="url(#grad-impressions)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title={`clips submitted ${per}`} subtitle="count of new clip submissions">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={clipsSubmitted} margin={chartMargin}>
            {commonAxes(clipsSubmitted)}
            <Tooltip {...tooltipProps} labelFormatter={tooltipLabelFmt} formatter={(v) => fmtInt(Number(v))} />
            <Bar dataKey="value" fill="var(--admin)" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title={`new clippers ${per}`} subtitle="signups joining the program">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={newClippersPerDay} margin={chartMargin}>
            {commonAxes(newClippersPerDay)}
            <Tooltip {...tooltipProps} labelFormatter={tooltipLabelFmt} formatter={(v) => fmtInt(Number(v))} />
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--accent)"
              strokeWidth={1.5}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="avg impressions per clip" subtitle="running total impressions ÷ clips">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={avgPerClip} margin={chartMargin}>
            {commonAxes(avgPerClip)}
            <Tooltip {...tooltipProps} labelFormatter={tooltipLabelFmt} formatter={(v) => fmtInt(Number(v))} />
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--admin)"
              strokeWidth={1.5}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

// Standalone payouts-per-day bar chart — lives on the payouts page now that
// money has moved off the overview dashboard. Reuses the shared chart styling.
export function PayoutsPerDayChart({ data }: { data: DailyPoint[] }) {
  return (
    <ChartCard title="payouts per day" subtitle="USDC paid out, by payout date">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={chartMargin}>
          {commonAxes(data)}
          <Tooltip {...tooltipProps} labelFormatter={tooltipLabelFmt} formatter={(v) => `$${Number(v).toFixed(2)}`} />
          <Bar dataKey="value" fill="var(--accent)" />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

const chartMargin = { top: 10, right: 12, bottom: 0, left: 0 };

const tooltipProps = {
  contentStyle: {
    background: "var(--bg)",
    border: "1px solid var(--border)",
    fontFamily: "var(--font-mono)",
    fontSize: "11px",
  },
  labelStyle: { color: "var(--text-3)" },
  itemStyle: { color: "var(--text)" },
  cursor: { fill: "var(--border)", opacity: 0.2 },
};

function commonAxes(data: DailyPoint[]) {
  // Show roughly 6 evenly-spaced x ticks; for short ranges show all.
  const step = Math.max(1, Math.floor(data.length / 6));
  const ticks = data.map((d) => d.date).filter((_, i) => i % step === 0);
  return (
    <>
      <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
      <XAxis
        dataKey="date"
        type="category"
        ticks={ticks}
        tick={{ fill: "var(--text-3)", fontSize: 10, fontFamily: "var(--font-mono)" }}
        tickFormatter={fmtTick}
        axisLine={{ stroke: "var(--border)" }}
        tickLine={false}
      />
      <YAxis
        tick={{ fill: "var(--text-3)", fontSize: 10, fontFamily: "var(--font-mono)" }}
        axisLine={{ stroke: "var(--border)" }}
        tickLine={false}
        width={40}
        tickFormatter={(v) => abbrev(Number(v))}
      />
    </>
  );
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Parse a bucket key ("YYYY-MM-DD" for day, ISO timestamp for hour) into a
// Date. Returns null if the input isn't a recognizable key — used to detect
// when Recharts hands us a numeric label (epoch 0 → "Jan 1 00:00") and we
// should fall back to reading from the data point instead of formatting garbage.
function parseBucketKey(value: unknown): { date: Date; hasHour: boolean } | null {
  if (typeof value !== "string") return null;
  if (value.includes("T")) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return { date: d, hasHour: true };
  }
  // Strict "YYYY-MM-DD" — anything else (numeric, "null", etc.) is rejected.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return { date: d, hasHour: false };
}

// Compact axis-tick format: "May 25" for day buckets, "May 25 14:00" for hour
// buckets. Keeps the x-axis legible at 6+ ticks.
function fmtTick(value: unknown): string {
  const parsed = parseBucketKey(value);
  if (!parsed) return typeof value === "string" ? value : "";
  const { date, hasHour } = parsed;
  const m = MONTHS[date.getUTCMonth()];
  const d = date.getUTCDate();
  if (!hasHour) return `${m} ${d}`;
  const h = String(date.getUTCHours()).padStart(2, "0");
  return `${m} ${d} ${h}:00`;
}

// Recharts' Tooltip `labelFormatter` sometimes receives a numeric index
// instead of the dataKey value (especially on bar charts with category axes),
// which would format as epoch zero → "Jan 1 00:00". Read the bucket key off
// the actual data point via the payload, falling back to the label only when
// the payload isn't usable.
function tooltipLabelFmt(
  label: unknown,
  payload?: ReadonlyArray<{ payload?: { date?: string } }>,
): string {
  const pointKey = payload?.[0]?.payload?.date;
  return fmtTick(pointKey ?? label);
}

function abbrev(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtInt(n: number): string {
  return n.toLocaleString();
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-border p-4 flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="label">{title}</span>
        {subtitle && (
          <span className="font-mono text-[10px] text-text-3">{subtitle}</span>
        )}
      </div>
      {children}
    </div>
  );
}
