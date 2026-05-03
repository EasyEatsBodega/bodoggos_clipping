import Link from "next/link";

type Crumb = { label: string; href?: string };

export function Header({ crumbs, accent = "accent" }: { crumbs: Crumb[]; accent?: "accent" | "admin" }) {
  const dotClass = accent === "admin" ? "bg-admin" : "bg-accent";
  return (
    <header className="border-b border-border">
      <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center gap-3">
        <span className={`dot-pulse ${dotClass}`} />
        <nav className="font-mono text-[11px] tracking-widest uppercase text-text-2 flex items-center gap-2">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && <span className="text-text-3">/</span>}
              {c.href ? (
                <Link href={c.href as never} className="hover:text-text">
                  {c.label}
                </Link>
              ) : (
                <span className="text-text">{c.label}</span>
              )}
            </span>
          ))}
        </nav>
      </div>
    </header>
  );
}
