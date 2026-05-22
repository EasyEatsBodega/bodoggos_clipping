"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "overview" },
  { href: "/admin/clippers", label: "clippers" },
  { href: "/admin/clips", label: "clips" },
  { href: "/admin/tags", label: "tags" },
  { href: "/admin/flags", label: "flags" },
  { href: "/admin/payouts", label: "payouts" },
  { href: "/admin/tax", label: "tax" },
  { href: "/admin/admins", label: "admins" },
  { href: "/admin/campaigns", label: "campaigns" },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  return (
    <div className="border-b border-border">
      <nav className="max-w-[1400px] mx-auto px-6 h-10 flex items-center gap-6 font-mono text-[11px] tracking-widest uppercase">
        {LINKS.map((l) => {
          const active =
            l.href === "/admin"
              ? pathname === "/admin"
              : pathname === l.href || pathname.startsWith(`${l.href}/`);
          return (
            <Link
              key={l.href}
              href={l.href as never}
              className={active ? "text-admin" : "text-text-2 hover:text-text"}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
