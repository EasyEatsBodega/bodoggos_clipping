"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Point = { t: number; impressions: number };

export function SnapshotChart({ data }: { data: Point[] }) {
  if (!data.length) {
    return (
      <div className="border border-border p-10 text-center text-text-2 font-mono text-sm">
        No snapshots yet.
      </div>
    );
  }
  return (
    <div className="border border-border p-2 h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#b2ff59" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#b2ff59" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v) => new Date(v).toISOString().slice(5, 16).replace("T", " ")}
            tick={{ fontFamily: "var(--font-mono)", fontSize: 10, fill: "#5a5a65" }}
            stroke="#1f1f24"
          />
          <YAxis
            tick={{ fontFamily: "var(--font-mono)", fontSize: 10, fill: "#5a5a65" }}
            stroke="#1f1f24"
            width={56}
          />
          <Tooltip
            contentStyle={{
              background: "#0f0f12",
              border: "1px solid #2a2a30",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
            }}
            labelFormatter={(v) => new Date(v as number).toISOString().slice(0, 16).replace("T", " ")}
            formatter={(v) => [String(v), "impressions"]}
          />
          <Area
            type="monotone"
            dataKey="impressions"
            stroke="#b2ff59"
            strokeWidth={1.5}
            fill="url(#g)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
