"use client";

import { useMemo, useState } from "react";
import type { Board, Fixture } from "@/lib/predictions";
import type { FormResult, Market } from "@/lib/model";

const TZ = "Africa/Lagos";
const dayFmt = new Intl.DateTimeFormat("en-NG", { timeZone: TZ, weekday: "long", day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat("en-NG", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });

interface SlipLeg {
  matchId: number;
  fixture: string;
  market: Market;
}

export default function BoardView({ board }: { board: Board }) {
  const [slip, setSlip] = useState<SlipLeg[]>([]);

  const days = useMemo(() => {
    const groups = new Map<string, Fixture[]>();
    for (const f of board.fixtures) {
      const d = dayFmt.format(new Date(f.match.utcDate));
      groups.set(d, [...(groups.get(d) ?? []), f]);
    }
    return [...groups.entries()];
  }, [board.fixtures]);

  const toggle = (f: Fixture, market: Market) => {
    setSlip((s) => {
      const existing = s.find((l) => l.matchId === f.match.id);
      const rest = s.filter((l) => l.matchId !== f.match.id);
      // One selection per match — picking a second market on the same game replaces it.
      if (existing?.market.key === market.key) return rest;
      return [...rest, { matchId: f.match.id, fixture: `${f.match.home.shortName} v ${f.match.away.shortName}`, market }];
    });
  };
  const selected = (matchId: number) => slip.find((l) => l.matchId === matchId)?.market.key;

  return (
    <div className="layout">
      <div>
        {days.length === 0 && (
          <div className="empty">
            No fixtures in the next 10 days for this competition (international break or off-season). Check another
            league above.
          </div>
        )}
        {days.map(([day, fixtures]) => (
          <section key={day}>
            <div className="day">{day}</div>
            {fixtures.map((f) => (
              <MatchCard key={f.match.id} f={f} selectedKey={selected(f.match.id)} onToggle={(m) => toggle(f, m)} />
            ))}
          </section>
        ))}
      </div>
      <aside className="side">
        <Slip slip={slip} onRemove={(id) => setSlip((s) => s.filter((l) => l.matchId !== id))} />
        <div className="card how">
          <h3>How to use it</h3>
          <ol>
            <li>Look at the <b>best pick</b> and its probability.</li>
            <li>Open <b>All markets</b> and type the odds Bet9ja / SportyBet is offering.</li>
            <li>Only bet when the value is <span className="ev-pos">green</span> — the bookie is paying more than the true chance deserves.</li>
            <li>Keep accumulators short: every extra leg multiplies the risk.</li>
          </ol>
        </div>
      </aside>
    </div>
  );
}

function MatchCard({ f, selectedKey, onToggle }: { f: Fixture; selectedKey?: string; onToggle: (m: Market) => void }) {
  const [open, setOpen] = useState(false);
  const { match: m, prediction: p } = f;
  const top = p.correctScores[0];
  const live = m.status === "IN_PLAY" || m.status === "PAUSED";

  return (
    <article className="card">
      <div className="card-top">
        <span>
          {live ? <b className="warn">LIVE</b> : timeFmt.format(new Date(m.utcDate))}
          {m.stage && m.stage !== "REGULAR_SEASON" ? ` · ${m.stage.replaceAll("_", " ").toLowerCase()}` : m.matchday ? ` · Matchday ${m.matchday}` : ""}
        </span>
        <span>
          xG {p.xgHome.toFixed(2)} – {p.xgAway.toFixed(2)}
          {p.dataQuality === "Limited" && <span className="warn"> · limited data</span>}
        </span>
      </div>

      <div className="teams">
        <div>
          <div className="team">
            {m.home.crest && <img className="crest" src={m.home.crest} alt="" />}
            <span>{m.home.shortName}</span>
          </div>
          <Form results={f.homeForm} />
        </div>
        <div className="score-pred" title="Most likely correct score">
          {top.score.replace("-", " – ")}
          <small>{pct(top.p)} likely</small>
        </div>
        <div>
          <div className="team away">
            <span>{m.away.shortName}</span>
            {m.away.crest && <img className="crest" src={m.away.crest} alt="" />}
          </div>
          <Form results={f.awayForm} away />
        </div>
      </div>

      <div className="bar" aria-label="Win/draw/win probabilities">
        <div className="h" style={{ width: pct(p.pHome) }}>{pct(p.pHome)}</div>
        <div className="d" style={{ width: pct(p.pDraw) }}>{pct(p.pDraw)}</div>
        <div className="a" style={{ width: pct(p.pAway) }}>{pct(p.pAway)}</div>
      </div>
      <div className="bar-legend">
        <span>Home</span>
        <span>Draw</span>
        <span>Away</span>
      </div>

      <div className="pick">
        <div>
          <div className="label">Best pick · {p.verdict} most likely result</div>
          <div className="val">
            {p.bestPick.label} <span className="muted small">· {pct(p.bestPick.p)} · fair odds {odds(p.bestPick.p)}</span>
          </div>
        </div>
        <span className={`conf ${p.confidence}`}>{p.confidence}</span>
      </div>

      <div className="row-actions">
        <button className={`btn ${selectedKey === p.bestPick.key ? "on" : ""}`} onClick={() => onToggle(p.bestPick)}>
          {selectedKey === p.bestPick.key ? "✓ In slip" : "+ Add best pick to slip"}
        </button>
        <button className="btn" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide markets" : "All markets & value check"}
        </button>
      </div>

      {open && <Markets markets={p.markets} selectedKey={selectedKey} onToggle={onToggle} correctScores={p.correctScores} />}
    </article>
  );
}

function Markets({
  markets,
  selectedKey,
  onToggle,
  correctScores,
}: {
  markets: Market[];
  selectedKey?: string;
  onToggle: (m: Market) => void;
  correctScores: { score: string; p: number }[];
}) {
  const [bookie, setBookie] = useState<Record<string, string>>({});
  let lastGroup = "";
  return (
    <>
      <div className="table-wrap">
      <table className="markets">
        <thead>
          <tr>
            <th>Market</th>
            <th>Chance</th>
            <th>Fair odds</th>
            <th>Bookie odds</th>
            <th>Value</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {markets.flatMap((mk) => {
            const rows = [];
            if (mk.group !== lastGroup) {
              lastGroup = mk.group;
              rows.push(
                <tr className="group" key={`g-${mk.group}`}>
                  <td colSpan={6}>{mk.group}</td>
                </tr>,
              );
            }
            const o = parseFloat(bookie[mk.key] ?? "");
            const ev = o > 1 ? mk.p * o - 1 : null;
            rows.push(
              <tr key={mk.key}>
                <td>{mk.label}</td>
                <td className="num">{pct(mk.p)}</td>
                <td className="num">{odds(mk.p)}</td>
                <td>
                  <input
                    className="odds-in"
                    inputMode="decimal"
                    placeholder="e.g. 1.85"
                    value={bookie[mk.key] ?? ""}
                    onChange={(e) => setBookie((b) => ({ ...b, [mk.key]: e.target.value }))}
                  />
                </td>
                <td className={`num ${ev !== null && ev > 0.03 ? "ev-pos" : "ev-neg"}`}>
                  {ev === null ? "–" : `${ev > 0 ? "+" : ""}${(ev * 100).toFixed(0)}%`}
                </td>
                <td>
                  <button
                    className={`add ${selectedKey === mk.key ? "on" : ""}`}
                    onClick={() => onToggle(mk)}
                    aria-label={`Add ${mk.label} to slip`}
                  >
                    {selectedKey === mk.key ? "✓" : "+"}
                  </button>
                </td>
              </tr>,
            );
            return rows;
          })}
        </tbody>
      </table>
      </div>
      <div className="muted small" style={{ marginTop: 12 }}>Most likely correct scores</div>
      <div className="cs">
        {correctScores.map((c) => (
          <div key={c.score}>
            <b>{c.score}</b>
            {pct(c.p)} · {odds(c.p)}
          </div>
        ))}
      </div>
    </>
  );
}

function Slip({ slip, onRemove }: { slip: SlipLeg[]; onRemove: (matchId: number) => void }) {
  // Assumes legs are independent — true across different matches.
  const p = slip.reduce((acc, l) => acc * l.market.p, 1);
  return (
    <div className="card slip">
      <h3>Accumulator ({slip.length})</h3>
      {slip.length === 0 ? (
        <div className="muted small">Add picks to see the combined chance of your slip landing.</div>
      ) : (
        <>
          {slip.map((l) => (
            <div className="slip-item" key={l.matchId}>
              <div>
                <div>{l.market.label}</div>
                <div className="muted small">{l.fixture} · {pct(l.market.p)}</div>
              </div>
              <button className="x" onClick={() => onRemove(l.matchId)} aria-label="Remove">✕</button>
            </div>
          ))}
          <div className="slip-total">
            <span>Chance all win</span>
            <b className={p < 0.2 ? "warn" : ""}>{pctFine(p)}</b>
          </div>
          <div className="slip-total">
            <span>Fair total odds</span>
            <b>{odds(p)}</b>
          </div>
          {slip.length >= 4 && (
            <p className="warn small">
              Long accas look attractive but usually lose — bookies add their margin to every leg.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Form({ results, away }: { results: FormResult[]; away?: boolean }) {
  if (!results.length) return null;
  // `results` is most-recent-first; the home side reads towards the centre, so flip it.
  const shown = away ? results : [...results].reverse();
  return (
    <div className={`form ${away ? "away" : ""}`} title="Last 5 results (most recent nearest the centre)">
      {shown.map((r, i) => (
        <span key={i} className={`f ${r}`}>{r}</span>
      ))}
    </div>
  );
}

function pct(p: number) {
  return `${Math.round(p * 100)}%`;
}
function pctFine(p: number) {
  return p < 0.1 ? `${(p * 100).toFixed(1)}%` : pct(p);
}
function odds(p: number) {
  return p > 0 ? (1 / p).toFixed(2) : "–";
}
