export function StatCell({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  accent?: "accent" | "admin" | "danger";
}) {
  const valueClass =
    accent === "accent"
      ? "text-accent"
      : accent === "admin"
      ? "text-admin"
      : accent === "danger"
      ? "text-danger"
      : "text-text";
  return (
    <div className="bg-bg p-5 flex flex-col gap-2 min-h-[112px]">
      <span className="label">{label}</span>
      <span className={`num text-2xl ${valueClass}`}>{value}</span>
      {hint && <span className="font-mono text-[10px] text-text-3">{hint}</span>}
    </div>
  );
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-border grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px">
      {children}
    </div>
  );
}
