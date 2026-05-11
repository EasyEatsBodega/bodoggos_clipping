"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import type { DailyPoint } from "@/lib/chart-data";

export type FlagsSeriesPoint = {
  date: string;
  clip: number;
  clipper: number;
};

export function FlagsOverTimeChart({ data }: { data: FlagsSeriesPoint[] }) {
  return (
    <div className="border border-border p-4 flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="label">flags created per day</span>
        <span className="font-mono text-[10px] text-text-3">
          new clip + clipper flags in window
        </span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={chartMargin}>
          {commonAxes(data.map((d) => ({ date: d.date, value: 0 })))}
          <Tooltip {...tooltipProps} formatter={(v) => fmtInt(Number(v))} />
          <Legend
            wrapperStyle={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              color: "var(--text-3)",
            }}
            iconSize={8}
          />
          <Bar dataKey="clip" name="clip flags" stackId="a" fill="var(--admin)" />
          <Bar
            dataKey="clipper"
            name="clipper flags"
            stackId="a"
            fill="var(--accent)"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FlaggedImpressionsByCreatorChart({
  data,
}: {
  data: { handle: string; impressions: number }[];
}) {
  return (
    <div className="border border-border p-4 flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="label">flagged impressions by creator</span>
        <span className="font-mono text-[10px] text-text-3">
          top 10 creators with flagged clips
        </span>
      </div>
      <ResponsiveContainer width="100%" height={Math.max(220, data.length * 28)}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 10, right: 16, bottom: 0, left: 0 }}
        >
          <CartesianGrid
            stroke="var(--border)"
            strokeDasharray="2 4"
            horizontal={false}
          />
          <XAxis
            type="number"
            tick={{
              fill: "var(--text-3)",
              fontSize: 10,
              fontFamily: "var(--font-mono)",
            }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
            tickFormatter={(v) => abbrev(Number(v))}
          />
          <YAxis
            type="category"
            dataKey="handle"
            tick={{
              fill: "var(--text-3)",
              fontSize: 10,
              fontFamily: "var(--font-mono)",
            }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
            width={110}
          />
          <Tooltip {...tooltipProps} formatter={(v) => fmtInt(Number(v))} />
          <Bar dataKey="impressions" fill="var(--admin)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
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
  const step = Math.max(1, Math.floor(data.length / 6));
  const ticks = data.map((d) => d.date).filter((_, i) => i % step === 0);
  return (
    <>
      <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
      <XAxis
        dataKey="date"
        ticks={ticks}
        tick={{ fill: "var(--text-3)", fontSize: 10, fontFamily: "var(--font-mono)" }}
        tickFormatter={shortDate}
        axisLine={{ stroke: "var(--border)" }}
        tickLine={false}
      />
      <YAxis
        tick={{ fill: "var(--text-3)", fontSize: 10, fontFamily: "var(--font-mono)" }}
        axisLine={{ stroke: "var(--border)" }}
        tickLine={false}
        width={40}
        tickFormatter={(v) => abbrev(Number(v))}
        allowDecimals={false}
      />
    </>
  );
}

function shortDate(ymd: string): string {
  const [, m, d] = ymd.split("-");
  return `${m}/${d}`;
}

function abbrev(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtInt(n: number): string {
  return n.toLocaleString();
}
