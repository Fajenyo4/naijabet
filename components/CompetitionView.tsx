import { notFound } from "next/navigation";
import { findCompetition, type CompetitionCode } from "@/lib/football";
import { getBoard } from "@/lib/predictions";
import BoardView from "./BoardView";
import PageReady from "./PageReady";

export default async function CompetitionView({ code }: { code: string }) {
  const comp = findCompetition(code);
  if (!comp) notFound();
  const board = await getBoard(comp.code as CompetitionCode);
  const bt = board.backtest;

  return (
    <>
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
            ? "The live data provider is busy right now. Real fixtures will appear within a few minutes, so refresh shortly."
            : <>No API key configured. Add a free <code>FOOTBALL_DATA_API_KEY</code> from football-data.org in your hosting settings (Netlify) to switch to real fixtures and results.</>}{" "}
          Teams below are real names but results are made up — do not bet on these.
        </div>
      ) : (
        <div className="notice live">
          Live data · {board.finishedCount} results analysed · updated {ago(board.fetchedAt)}
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
      <PageReady id={comp.code} />
    </>
  );
}

function pct(x: number) {
  return `${Math.round(x * 100)}%`;
}

function ago(iso: string) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return `${h} hour${h > 1 ? "s" : ""} ago`;
}
