import { test } from "node:test";
import assert from "node:assert/strict";
import { backtest, pickSafe, buildRatings, expectedValue, marketWon, predict, recentForm, scoreMatrix, type Match, type Team } from "../lib/model.ts";

const team = (id: number, name: string): Team => ({ id, name, shortName: name });
const STRONG = team(1, "Strong"), WEAK = team(2, "Weak"), MID = team(3, "Mid"), MID2 = team(4, "Mid2");

let nextId = 1;
function game(daysAgo: number, home: Team, away: Team, hg: number, ag: number): Match {
  return {
    id: nextId++,
    utcDate: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
    status: "FINISHED",
    home,
    away,
    homeGoals: hg,
    awayGoals: ag,
  };
}

function league(): Match[] {
  const out: Match[] = [];
  for (let d = 100; d > 0; d -= 7) {
    out.push(game(d, STRONG, WEAK, 3, 0), game(d - 1, MID, MID2, 1, 1));
    out.push(game(d - 3, WEAK, MID, 0, 1), game(d - 3, MID2, STRONG, 0, 2));
  }
  return out;
}

test("score matrix is a probability distribution", () => {
  const m = scoreMatrix(1.6, 1.1);
  const total = m.flat().reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
  assert.ok(m.flat().every((p) => p >= 0));
});

test("strong team is rated above weak team and favoured", () => {
  const r = buildRatings(league(), new Date());
  assert.ok(r.teams.get(1)!.attack > r.teams.get(2)!.attack);
  assert.ok(r.teams.get(1)!.defence < r.teams.get(2)!.defence);

  const fixture: Match = { id: 999, utcDate: new Date().toISOString(), status: "TIMED", home: STRONG, away: WEAK, homeGoals: null, awayGoals: null };
  const p = predict(fixture, r);
  assert.ok(p.pHome > 0.6, `home win prob ${p.pHome}`);
  assert.ok(Math.abs(p.pHome + p.pDraw + p.pAway - 1) < 1e-9);
  assert.equal(p.verdict, "Strong win");
  // Best pick must still be worth betting on (fair odds >= 1.30).
  assert.ok(1 / p.bestPick.p >= 1.3);
});

test("complementary markets sum to one", () => {
  const r = buildRatings(league(), new Date());
  const p = predict({ id: 5, utcDate: new Date().toISOString(), status: "TIMED", home: MID, away: MID2, homeGoals: null, awayGoals: null }, r);
  const get = (k: string) => p.markets.find((m) => m.key === k)!.p;
  assert.ok(Math.abs(get("O2.5") + get("U2.5") - 1) < 1e-9);
  assert.ok(Math.abs(get("GG") + get("NG") - 1) < 1e-9);
  assert.ok(Math.abs(get("1X") - (p.pHome + p.pDraw)) < 1e-9);
});

test("recent results count more than old ones", () => {
  // Team 3 was bad long ago but has been scoring freely lately.
  const matches = [
    ...Array.from({ length: 10 }, (_, i) => (i % 2 ? game(300 + i, MID, MID2, 0, 2) : game(300 + i, MID2, MID, 2, 0))),
    ...Array.from({ length: 6 }, (_, i) => (i % 2 ? game(5 + i * 3, MID, MID2, 3, 0) : game(5 + i * 3, MID2, MID, 0, 3))),
  ];
  const r = buildRatings(matches, new Date());
  assert.ok(r.teams.get(3)!.attack > r.teams.get(4)!.attack);
});

test("form, EV and settlement helpers", () => {
  const ms = [game(3, STRONG, WEAK, 2, 0), game(10, WEAK, STRONG, 1, 1), game(20, STRONG, MID, 0, 1)];
  assert.deepEqual(recentForm(ms, 1), ["W", "D", "L"]);
  assert.ok(Math.abs(expectedValue(0.5, 2.2) - 0.1) < 1e-9);
  assert.equal(marketWon("GG", 1, 1), true);
  assert.equal(marketWon("U2.5", 2, 1), false);
  assert.equal(marketWon("X2", 0, 0), true);
});

test("backtest beats the naive baseline on a league with real strength gaps", () => {
  const bt = backtest(league(), 20);
  assert.ok(bt);
  assert.ok(bt.brier < bt.baselineBrier, JSON.stringify(bt));
});

test("safe pick is the longest-priced market still rated 80%+", () => {
  const mk = (key: string, p: number) => ({ key, label: key, group: "Goals" as const, p });
  assert.equal(pickSafe([mk("a", 0.95), mk("b", 0.82), mk("c", 0.6)])?.key, "b");
  assert.equal(pickSafe([mk("a", 0.7), mk("b", 0.5)]), null);
});

test("backtest tracks safe picks consistently", () => {
  const bt = backtest(league(), 20)!;
  assert.ok(bt.safeHits <= bt.safePicks && bt.safePicks <= bt.matches);
  // Every winning safe pick pays fair odds between 1 and 1.25 (p >= 0.8).
  assert.ok(bt.safeOddsWon >= bt.safeHits && bt.safeOddsWon <= bt.safeHits * 1.25 + 1e-9);
});
