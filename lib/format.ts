export function fmtInt(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US").format(n);
}

export function fmtUsd(s: string | number | null | undefined): string {
  if (s == null) return "$0.00";
  const n = typeof s === "string" ? Number(s) : s;
  if (!Number.isFinite(n)) return "$0.00";
  return `$${n.toFixed(2)}`;
}

export function fmtRelative(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const sec = Math.round(diff / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);
  if (sec < 60) return `${sec}s ago`;
  if (min < 60) return `${min}m ago`;
  if (hr < 24) return `${hr}h ago`;
  if (day < 30) return `${day}d ago`;
  return d.toISOString().slice(0, 10);
}

export function fmtCountdown(toIso: string, now: Date = new Date()): string {
  const ms = new Date(toIso).getTime() - now.getTime();
  if (ms <= 0) return "expired";
  const sec = Math.floor(ms / 1000);
  const day = Math.floor(sec / 86400);
  const hr = Math.floor((sec % 86400) / 3600);
  if (day > 0) return `${day}d ${hr}h`;
  const min = Math.floor((sec % 3600) / 60);
  return `${hr}h ${min}m`;
}
