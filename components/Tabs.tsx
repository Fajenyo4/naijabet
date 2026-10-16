"use client";

import { useEffect, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { COMPETITIONS } from "@/lib/football";
import { PAGE_READY_EVENT } from "./PageReady";

const TABS = [{ href: "/safe", label: "⭐ Safe Picks" }, ...COMPETITIONS.map((c) => ({ href: `/c/${c.code}`, label: c.name }))];

// Lives in the root layout so it stays on screen while the next page loads. Loading
// feedback is shown from the tap itself, so it never depends on how fast the server is.
export default function Tabs() {
  const path = usePathname();
  const current = (path === "/" ? "/c/PL" : path).toUpperCase();
  const [pending, setPending] = useState<{ href: string; label: string } | null>(null);

  // Clear once the new page's content has actually rendered (the URL changes earlier).
  useEffect(() => {
    const done = () => setPending(null);
    window.addEventListener(PAGE_READY_EVENT, done);
    return () => window.removeEventListener(PAGE_READY_EVENT, done);
  }, []);
  // Never leave the page dimmed if a navigation fails.
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setPending(null), 20_000);
    return () => clearTimeout(t);
  }, [pending]);

  return (
    <>
      <nav className="tabs">
        {TABS.map((t) => {
          const active = (pending ? pending.href.toUpperCase() : current) === t.href.toUpperCase();
          return (
            <Link
              key={t.href}
              href={t.href}
              // Prefetching every tab rendered all leagues for each visitor (and spent the
              // data provider's rate limit); the tap-time loading bar makes it unnecessary.
              prefetch={false}
              className={`tab ${active ? "active" : ""}`}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || t.href.toUpperCase() === current) return;
                setPending(t);
              }}
            >
              {t.label}
              <PendingSpinner />
            </Link>
          );
        })}
      </nav>
      {pending && (
        <div className="nav-loading" role="status" aria-live="polite">
          <div className="nav-progress" />
          <div className="nav-loading-msg">
            <span className="spinner" /> Loading {pending.label.replace("⭐ ", "")}…
          </div>
        </div>
      )}
    </>
  );
}

function PendingSpinner() {
  const { pending } = useLinkStatus();
  return pending ? <span className="spinner tab-spinner" aria-hidden /> : null;
}
