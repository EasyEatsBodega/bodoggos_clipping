"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "dashboard" },
  { href: "/dashboard/settings", label: "settings" },
] as const;

export function ClipperNav() {
  const pathname = usePathname();
  return (
    <div className="border-b border-border">
      <nav className="max-w-[1400px] mx-auto px-6 h-10 flex items-center gap-6 font-mono text-[11px] tracking-widest uppercase">
        {LINKS.map((l) => {
          const active =
            l.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname === l.href || pathname.startsWith(`${l.href}/`);
          return (
            <Link
              key={l.href}
              href={l.href as never}
              className={active ? "text-accent" : "text-text-2 hover:text-text"}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
