import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "NaijaBet AI – Football Predictions",
  description:
    "Data-driven football predictions for the Premier League, Champions League and top European leagues: 1X2, double chance, over/under, GG/NG and correct score probabilities.",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = { themeColor: "#0b1220", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="header">
          <div className="container header-inner">
            <Link href="/" className="brand">
              <span className="brand-dot">⚽</span> NaijaBet AI
            </Link>
            <span className="badge-18">18+ · Bet responsibly</span>
          </div>
        </header>
        <main className="container">{children}</main>
        <footer className="footer">
          <div className="container">
            <p>
              <strong>Predictions are probabilities, not guarantees.</strong> Football is high-variance — even the
              strongest pick in this app loses regularly. No model consistently beats the bookmaker's margin, so never
              stake money you can't afford to lose and never chase losses.
            </p>
            <p>
              18+ only. Not affiliated with Bet9ja, SportyBet or any bookmaker. If betting is affecting your life, take a
              break and use your bookmaker's deposit limits and self-exclusion tools.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
