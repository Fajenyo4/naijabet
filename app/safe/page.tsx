import { findCompetition, type CompetitionCode } from "@/lib/football";
import { getBoard, type Board } from "@/lib/predictions";
import { SAFE_THRESHOLD } from "@/lib/model";

export const dynamic = "force-dynamic";
export const metadata = { title: "Safe Picks (80%+) – NaijaBet" };

// Limited to four competitions: each costs two API calls and the free tier allows 10 a minute.
const SAFE_COMPETITIONS: CompetitionCode[] = ["PL", "CL", "PD", "SA"];
// Typical bookmaker margin on short-priced markets, used to estimate real returns.
const BOOKIE_MARGIN = 0.06;

const TZ = "Africa/Lagos";
const dayFmt = new Intl.DateTimeFormat("en-NG", { timeZone: TZ, weekday: "long", day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat("en-NG", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });

export default async function SafePicksPage() {
  const boards = await Promise.all(SAFE_COMPETITIONS.map(getBoard));
  const live = boards.filter((b) => b.source === "live");
  // Never mix simulated and real data: if any league is live, show only live leagues.
  const shown: Board[] = live.length ? live : boards;
  const unavailable = live.length ? boards.filter((b) => b.source !== "live").map((b) => findCompetition(b.code)!.name) : [];
  const demo = live.length === 0;

  const picks = shown
    .flatMap((b) =>
      b.fixtures.filter((f) => f.prediction.safePick).map((f) => ({ ...f, comp: findCompetition(b.code)!.name })),
    )
    .sort((a, b) => a.match.utcDate.localeCompare(b.match.utcDate));

  const days = new Map<string, typeof picks>();
  for (const p of picks) {
    const d = dayFmt.format(new Date(p.match.utcDate));
    days.set(d, [...(days.get(d) ?? []), p]);
  }

  let n = 0, hits = 0, oddsWon = 0;
  for (const b of shown) {
    if (!b.backtest) continue;
    n += b.backtest.safePicks;
    hits += b.backtest.safeHits;
    oddsWon += b.backtest.safeOddsWon;
  }
  const hitRate = n ? hits / n : null;
  // Return per ₦100 staked if every safe pick had been backed at typical bookie odds.
  const estReturn = n ? (oddsWon * (1 - BOOKIE_MARGIN)) / n - 1 : null;

  return (
    <>
      <section className="hero">
        <div className="muted small">Premier League · Champions League · La Liga · Serie A</div>
        <h1>Safe Picks: {Math.round(SAFE_THRESHOLD * 100)}%+ chance</h1>
        <p>
          Only bets the model rates at {Math.round(SAFE_THRESHOLD * 100)}% or more. For each match it shows the one that
          pays the most while still clearing that bar. Safe picks win often but pay little, so check the track record
          below before relying on them.
        </p>
      </section>

      {demo ? (
        <div className="notice demo">
          <strong>Demo mode – simulated data.</strong> Live data isn&apos;t available right now, so these picks and the
          track record come from made-up results. Do not bet on them.
        </div>
      ) : (
        unavailable.length > 0 && (
          <div className="notice demo">{unavailable.join(", ")} couldn&apos;t be loaded right now and are left out. Refresh in a minute.</div>
        )
      )}

      {hitRate !== null && estReturn !== null && (
        <div className="stats">
          <div className="stat">
            <div className="k">Safe picks that won</div>
            <div className="v">{Math.round(hitRate * 100)}%</div>
            <div className="s">{hits} of {n} past picks, walk-forward</div>
          </div>
          <div className="stat">
            <div className="k">Typical odds</div>
            <div className="v">{hits ? (oddsWon / hits).toFixed(2) : "–"}</div>
            <div className="s">fair odds of the winning picks</div>
          </div>
          <div className="stat">
            <div className="k">Est. result per ₦1,000 staked</div>
            <div className="v" style={{ color: estReturn >= 0 ? "#42d392" : "var(--red)" }}>
              {estReturn >= 0 ? "+" : "−"}₦{Math.abs(Math.round(estReturn * 1000)).toLocaleString("en-NG")}
            </div>
            <div className="s">singles at typical bookie odds (~{Math.round(BOOKIE_MARGIN * 100)}% margin)</div>
          </div>
        </div>
      )}

      {picks.length === 0 ? (
        <div className="empty">
          No match has an {Math.round(SAFE_THRESHOLD * 100)}%+ pick in the next 10 days. That&apos;s normal during
          international breaks. Check back closer to the weekend.
        </div>
      ) : (
        [...days.entries()].map(([day, list]) => (
          <section key={day}>
            <div className="day">{day}</div>
            {list.map((f) => {
              const pick = f.prediction.safePick!;
              return (
                <article className="card safe-row" key={f.match.id}>
                  <div className="card-top">
                    <span>{timeFmt.format(new Date(f.match.utcDate))} · {f.comp}</span>
                    {f.prediction.dataQuality === "Limited" && <span className="warn">limited data</span>}
                  </div>
                  <div className="safe-teams">{f.match.home.shortName} v {f.match.away.shortName}</div>
                  <div className="pick">
                    <div>
                      <div className="label">Safe pick</div>
                      <div className="val">{pick.label}</div>
                      <div className="muted small">Only worth it at odds of {(1 / pick.p).toFixed(2)} or higher</div>
                    </div>
                    <span className="safe-p">{Math.round(pick.p * 100)}%</span>
                  </div>
                </article>
              );
            })}
          </section>
        ))
      )}

      <div className="card how">
        <h3>Read this before you stake</h3>
        <ol>
          <li>Back safe picks as <b>singles</b>. Five 80% picks in one accumulator land only about 1 time in 3.</li>
          <li>If your bookie&apos;s odds are below the &quot;only worth it&quot; number, skip it. You&apos;re being underpaid.</li>
          <li>One loss wipes out about four wins at these prices, so keep stakes small and even.</li>
        </ol>
      </div>
    </>
  );
}
