"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { COMPETITIONS } from "@/lib/football";

// Lives in the root layout so it stays on screen (and highlights the new tab
// immediately) while the next page's predictions are loading.
export default function Tabs() {
  const path = usePathname();
  const active = path === "/" ? "/c/PL" : path;
  const tabs = [{ href: "/safe", label: "⭐ Safe Picks" }, ...COMPETITIONS.map((c) => ({ href: `/c/${c.code}`, label: c.name }))];
  return (
    <nav className="tabs">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={`tab ${active.toUpperCase() === t.href.toUpperCase() ? "active" : ""}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
