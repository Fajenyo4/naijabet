import Link from "next/link";
import { notFound } from "next/navigation";
import { COMPETITIONS, findCompetition, type CompetitionCode } from "@/lib/football";
import { getBoard } from "@/lib/predictions";
import BoardView from "./BoardView";

export default async function CompetitionView({ code }: { code: string }) {
  const comp = findCompetition(code);
  if (!comp) notFound();
  const board = await getBoard(comp.code as CompetitionCode);
  const bt = board.backtest;

  return (
    <>
      <nav className="tabs">
        {COMPETITIONS.map((c) => (
          <Link key={c.code} href={`/c/${c.code}`} className={`tab ${c.code === comp.code ? "active" : ""}`}>
            {c.name}
          </Link>
        ))}
      </nav>

      <section className="hero">
        <div className="muted small">{comp.country}</div>
        <h1>{comp.name} predictions</h1>
        <p>
          Every upcoming fixture rated from each team's recent results — weighted towards the last few weeks and
          adjusted for opponent strength. Enter your Bet9ja / SportyBet odds to see if a bet has value.
        </p>
      </section>

      {board.source === "demo" ? (
        <div className="notice demo">
          <strong>Demo mode – simulated data.</strong>{" "}
          {board.error
            ? `Live data unavailable right now (${board.error}).`
            : <>No API key configured. Add a free <code>FOOTBALL_DATA_API_KEY</code> from football-data.org in Vercel to switch to real fixtures and results.</>}{" "}
          Teams below are real names but results are made up — do not bet on these.
        </div>
      ) : (
        <div className="notice live">
          Live data · {board.finishedCount} results analysed · refreshes automatically every few hours
        </div>
      )}

      {bt && (
        <div className="stats">
          <div className="stat">
            <div className="k">Result (1X2) hit rate</div>
            <div className="v">{pct(bt.resultHitRate)}</div>
            <div className="s">last {bt.matches} matches, walk-forward</div>
          </div>
          <div className="stat">
            <div className="k">Best-pick hit rate</div>
            <div className="v">{pct(bt.bestPickHitRate)}</div>
            <div className="s">min. fair odds 1.30</div>
          </div>
          <div className="stat">
            <div className="k">Accuracy vs guessing</div>
            <div className="v">{bt.brier < bt.baselineBrier ? "+" : ""}{(((bt.baselineBrier - bt.brier) / bt.baselineBrier) * 100).toFixed(1)}%</div>
            <div className="s">Brier score {bt.brier.toFixed(3)} vs {bt.baselineBrier.toFixed(3)}</div>
          </div>
        </div>
      )}

      <BoardView board={board} />
    </>
  );
}

function pct(x: number) {
  return `${Math.round(x * 100)}%`;
}
