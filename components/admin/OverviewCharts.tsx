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
            <Tooltip {...tooltipProps} labelFormatter={fmtTick} formatter={(v) => fmtInt(Number(v))} />
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
            <Tooltip {...tooltipProps} labelFormatter={fmtTick} formatter={(v) => fmtInt(Number(v))} />
            <Bar dataKey="value" fill="var(--admin)" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title={`new clippers ${per}`} subtitle="signups joining the program">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={newClippersPerDay} margin={chartMargin}>
            {commonAxes(newClippersPerDay)}
            <Tooltip {...tooltipProps} labelFormatter={fmtTick} formatter={(v) => fmtInt(Number(v))} />
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
            <Tooltip {...tooltipProps} labelFormatter={fmtTick} formatter={(v) => fmtInt(Number(v))} />
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
          <Tooltip {...tooltipProps} labelFormatter={fmtTick} formatter={(v) => `$${Number(v).toFixed(2)}`} />
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

// Bucket keys are either "YYYY-MM-DD" (day) or an ISO timestamp (hour).
// Recharts may hand the formatter the raw string key OR — when it treats the
// hourly ISO keys as a time axis — a numeric epoch. Normalize both, and never
// assume the argument is a string (a non-string here is what crashed 24H/7D).
function fmtTick(value: unknown): string {
  if (typeof value === "number") {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    const h = String(d.getUTCHours()).padStart(2, "0");
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${h}h`;
  }
  const key = String(value ?? "");
  if (key.includes("T")) {
    const d = new Date(key);
    if (Number.isNaN(d.getTime())) return key;
    const h = String(d.getUTCHours()).padStart(2, "0");
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${h}h`;
  }
  const parts = key.split("-");
  return parts.length >= 3 ? `${parts[1]}/${parts[2]}` : key;
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
