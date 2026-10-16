// Match prediction engine.
//
// Approach (a lightweight Dixon–Coles model):
//  1. Every finished match is weighted by recency (exponential decay), so last
//     month's results count far more than last season's.
//  2. Each team gets an attack and a defence rating, fitted iteratively so that
//     scoring against a strong defence counts for more than scoring against a weak one.
//  3. Ratings are shrunk towards league average until a team has enough games.
//  4. Expected goals for a fixture -> Poisson score matrix (with the Dixon–Coles
//     low-score correction) -> probabilities for every betting market.
//
// This file has no imports so it can be unit-tested directly with Node.

export interface Team {
  id: number;
  name: string;
  shortName: string;
  crest?: string;
}

export interface Match {
  id: number;
  utcDate: string;
  status: string;
  matchday?: number | null;
  stage?: string | null;
  home: Team;
  away: Team;
  homeGoals: number | null;
  awayGoals: number | null;
}

export interface TeamRating {
  attack: number;
  defence: number; // > 1 means leakier than average
  weight: number; // effective number of recent matches
}

export interface Ratings {
  avgHome: number;
  avgAway: number;
  teams: Map<number, TeamRating>;
}

export interface Market {
  key: string;
  label: string;
  group: "1X2" | "Double chance" | "Goals" | "BTTS" | "Team goals";
  p: number;
}

export interface Prediction {
  matchId: number;
  xgHome: number;
  xgAway: number;
  pHome: number;
  pDraw: number;
  pAway: number;
  markets: Market[];
  correctScores: { score: string; p: number }[];
  bestPick: Market;
  safePick: Market | null;
  verdict: string;
  confidence: "High" | "Medium" | "Low";
  dataQuality: "Good" | "Limited";
}

export const HALF_LIFE_DAYS = 120;
const SHRINK_MATCHES = 4; // pseudo-matches of "league average" added to every team
const RHO = -0.08; // Dixon–Coles low-score dependence
const MAX_GOALS = 10;
const DAY = 86_400_000;

export function isFinished(m: Match): boolean {
  return m.status === "FINISHED" && m.homeGoals !== null && m.awayGoals !== null;
}

export function buildRatings(matches: Match[], asOf: Date, halfLife = HALF_LIFE_DAYS): Ratings {
  const t0 = asOf.getTime();
  const games = matches
    .filter((m) => isFinished(m) && new Date(m.utcDate).getTime() < t0)
    .map((m) => ({
      h: m.home.id,
      a: m.away.id,
      hg: m.homeGoals as number,
      ag: m.awayGoals as number,
      w: Math.pow(0.5, (t0 - new Date(m.utcDate).getTime()) / DAY / halfLife),
    }));

  let sw = 0, sh = 0, sa = 0;
  for (const g of games) {
    sw += g.w;
    sh += g.w * g.hg;
    sa += g.w * g.ag;
  }
  // Sensible European-football defaults when there is no data yet.
  const avgHome = sw > 0 ? sh / sw : 1.5;
  const avgAway = sw > 0 ? sa / sw : 1.2;
  const mean = (avgHome + avgAway) / 2;
  const prior = SHRINK_MATCHES * mean;

  const teams = new Map<number, TeamRating>();
  const ensure = (id: number) => {
    if (!teams.has(id)) teams.set(id, { attack: 1, defence: 1, weight: 0 });
    return teams.get(id)!;
  };
  for (const g of games) {
    ensure(g.h).weight += g.w;
    ensure(g.a).weight += g.w;
  }

  for (let iter = 0; iter < 25; iter++) {
    const scored = new Map<number, number>();
    const expScored = new Map<number, number>();
    const conceded = new Map<number, number>();
    const expConceded = new Map<number, number>();
    const add = (map: Map<number, number>, id: number, v: number) => map.set(id, (map.get(id) ?? 0) + v);

    for (const g of games) {
      const H = teams.get(g.h)!, A = teams.get(g.a)!;
      add(scored, g.h, g.w * g.hg);
      add(expScored, g.h, g.w * avgHome * A.defence);
      add(conceded, g.h, g.w * g.ag);
      add(expConceded, g.h, g.w * avgAway * A.attack);

      add(scored, g.a, g.w * g.ag);
      add(expScored, g.a, g.w * avgAway * H.defence);
      add(conceded, g.a, g.w * g.hg);
      add(expConceded, g.a, g.w * avgHome * H.attack);
    }

    let attSum = 0, defSum = 0, n = 0;
    for (const [id, r] of teams) {
      r.attack = ((scored.get(id) ?? 0) + prior) / ((expScored.get(id) ?? 0) + prior);
      r.defence = ((conceded.get(id) ?? 0) + prior) / ((expConceded.get(id) ?? 0) + prior);
      attSum += r.attack;
      defSum += r.defence;
      n++;
    }
    // Keep the ratings centred on 1 so avgHome/avgAway stay meaningful.
    if (n > 0) {
      for (const r of teams.values()) {
        r.attack /= attSum / n;
        r.defence /= defSum / n;
      }
    }
  }

  return { avgHome, avgAway, teams };
}

function poisson(k: number, lambda: number): number {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}

export function scoreMatrix(lh: number, la: number): number[][] {
  const m: number[][] = [];
  let total = 0;
  for (let h = 0; h <= MAX_GOALS; h++) {
    m.push([]);
    for (let a = 0; a <= MAX_GOALS; a++) {
      let tau = 1;
      if (h === 0 && a === 0) tau = 1 - lh * la * RHO;
      else if (h === 0 && a === 1) tau = 1 + lh * RHO;
      else if (h === 1 && a === 0) tau = 1 + la * RHO;
      else if (h === 1 && a === 1) tau = 1 - RHO;
      const p = Math.max(0, tau * poisson(h, lh) * poisson(a, la));
      m[h].push(p);
      total += p;
    }
  }
  for (const row of m) for (let a = 0; a < row.length; a++) row[a] /= total;
  return m;
}

const sumWhere = (m: number[][], f: (h: number, a: number) => boolean) => {
  let s = 0;
  for (let h = 0; h < m.length; h++) for (let a = 0; a < m[h].length; a++) if (f(h, a)) s += m[h][a];
  return s;
};

// Markets whose fair odds are below this are too short to be worth recommending
// (bookies pay ~1.05 on "Over 0.5 goals" — technically "safe", practically useless).
export const MIN_PICK_ODDS = 1.3;

export function predict(match: Match, ratings: Ratings): Prediction {
  const unknown: TeamRating = { attack: 1, defence: 1, weight: 0 };
  const H = ratings.teams.get(match.home.id) ?? unknown;
  const A = ratings.teams.get(match.away.id) ?? unknown;
  const xgHome = clamp(ratings.avgHome * H.attack * A.defence, 0.15, 5);
  const xgAway = clamp(ratings.avgAway * A.attack * H.defence, 0.15, 5);
  const m = scoreMatrix(xgHome, xgAway);

  const pHome = sumWhere(m, (h, a) => h > a);
  const pDraw = sumWhere(m, (h, a) => h === a);
  const pAway = sumWhere(m, (h, a) => h < a);
  const goals = (line: number) => sumWhere(m, (h, a) => h + a > line);
  const btts = sumWhere(m, (h, a) => h > 0 && a > 0);
  const hn = match.home.shortName, an = match.away.shortName;

  const markets: Market[] = [
    { key: "1", label: `${hn} win (1)`, group: "1X2", p: pHome },
    { key: "X", label: "Draw (X)", group: "1X2", p: pDraw },
    { key: "2", label: `${an} win (2)`, group: "1X2", p: pAway },
    { key: "1X", label: `${hn} or draw (1X)`, group: "Double chance", p: pHome + pDraw },
    { key: "X2", label: `${an} or draw (X2)`, group: "Double chance", p: pAway + pDraw },
    { key: "12", label: "Either team wins (12)", group: "Double chance", p: pHome + pAway },
    { key: "O1.5", label: "Over 1.5 goals", group: "Goals", p: goals(1.5) },
    { key: "O2.5", label: "Over 2.5 goals", group: "Goals", p: goals(2.5) },
    { key: "O3.5", label: "Over 3.5 goals", group: "Goals", p: goals(3.5) },
    { key: "U2.5", label: "Under 2.5 goals", group: "Goals", p: 1 - goals(2.5) },
    { key: "U3.5", label: "Under 3.5 goals", group: "Goals", p: 1 - goals(3.5) },
    { key: "GG", label: "Both teams score (GG)", group: "BTTS", p: btts },
    { key: "NG", label: "Both teams score – No (NG)", group: "BTTS", p: 1 - btts },
    { key: "H0.5", label: `${hn} to score`, group: "Team goals", p: sumWhere(m, (h) => h > 0) },
    { key: "A0.5", label: `${an} to score`, group: "Team goals", p: sumWhere(m, (_h, a) => a > 0) },
    { key: "H1.5", label: `${hn} over 1.5 goals`, group: "Team goals", p: sumWhere(m, (h) => h > 1) },
    { key: "A1.5", label: `${an} over 1.5 goals`, group: "Team goals", p: sumWhere(m, (_h, a) => a > 1) },
  ];

  const correctScores: { score: string; p: number }[] = [];
  for (let h = 0; h <= 6; h++) for (let a = 0; a <= 6; a++) correctScores.push({ score: `${h}-${a}`, p: m[h][a] });
  correctScores.sort((x, y) => y.p - x.p);

  const bestPick = pickBest(markets);
  const safePick = pickSafe(markets);
  const top = Math.max(pHome, pDraw, pAway);
  const verdict =
    top === pHome ? `${hn} win` : top === pAway ? `${an} win` : "Draw";
  const confidence = bestPick.p >= 0.7 ? "High" : bestPick.p >= 0.58 ? "Medium" : "Low";
  const dataQuality = H.weight >= 4 && A.weight >= 4 ? "Good" : "Limited";

  return {
    matchId: match.id,
    xgHome,
    xgAway,
    pHome,
    pDraw,
    pAway,
    markets,
    correctScores: correctScores.slice(0, 6),
    bestPick,
    safePick,
    verdict,
    confidence,
    dataQuality,
  };
}

/** Highest-probability market that still pays at least MIN_PICK_ODDS at fair odds. */
export function pickBest(markets: Market[]): Market {
  const eligible = markets.filter((mk) => 1 / mk.p >= MIN_PICK_ODDS);
  const pool = eligible.length ? eligible : markets;
  return pool.reduce((best, mk) => (mk.p > best.p ? mk : best));
}

export const SAFE_THRESHOLD = 0.8;

/**
 * Among markets the model rates at SAFE_THRESHOLD or better, the one that pays most
 * (i.e. the least-likely of the "safe" options). Null when nothing clears the bar.
 */
export function pickSafe(markets: Market[], threshold = SAFE_THRESHOLD): Market | null {
  const safe = markets.filter((mk) => mk.p >= threshold);
  if (!safe.length) return null;
  return safe.reduce((best, mk) => (mk.p < best.p ? mk : best));
}

export function fairOdds(p: number): number {
  return p > 0 ? 1 / p : Infinity;
}

/** Expected profit per 1 unit staked at the bookmaker's decimal odds. */
export function expectedValue(p: number, bookieOdds: number): number {
  return p * bookieOdds - 1;
}

export type FormResult = "W" | "D" | "L";

export function recentForm(matches: Match[], teamId: number, n = 5): FormResult[] {
  return matches
    .filter((m) => isFinished(m) && (m.home.id === teamId || m.away.id === teamId))
    .sort((a, b) => b.utcDate.localeCompare(a.utcDate))
    .slice(0, n)
    .map((m) => {
      const gf = m.home.id === teamId ? m.homeGoals! : m.awayGoals!;
      const ga = m.home.id === teamId ? m.awayGoals! : m.homeGoals!;
      return gf > ga ? "W" : gf === ga ? "D" : "L";
    });
}

export interface Backtest {
  matches: number;
  resultHitRate: number; // model's 1X2 favourite was correct
  bestPickHitRate: number;
  brier: number; // lower is better
  baselineBrier: number; // always predicting the league's average H/D/A rates
  safePicks: number; // matches where the model had an 80%+ pick
  safeHits: number;
  safeOddsWon: number; // sum of fair odds of winning safe picks, for return estimates
}

/**
 * Walk-forward test: each match is predicted using only results played before it,
 * exactly as the app would have predicted it at the time.
 */
export function backtest(matches: Match[], minHistory = 60, maxTested = 250): Backtest | null {
  const done = matches.filter(isFinished).sort((a, b) => a.utcDate.localeCompare(b.utcDate));
  if (done.length <= minHistory + 10) return null;
  const tested = done.slice(Math.max(minHistory, done.length - maxTested));

  let hits = 0, pickHits = 0, brier = 0, baseBrier = 0;
  let safePicks = 0, safeHits = 0, safeOddsWon = 0;
  // Ratings are refitted once per week (as of the start of that week): far cheaper
  // than refitting every match day, and still never uses a result from the future.
  const WEEK = 7 * DAY;
  let cachedWeek = -1;
  let ratings: Ratings | null = null;
  for (const m of tested) {
    const week = Math.floor(new Date(m.utcDate).getTime() / WEEK);
    if (week !== cachedWeek) {
      ratings = buildRatings(done, new Date(week * WEEK));
      cachedWeek = week;
    }
    const pred = predict(m, ratings!);
    const hg = m.homeGoals!, ag = m.awayGoals!;
    const outcome = hg > ag ? 0 : hg === ag ? 1 : 2;
    const probs = [pred.pHome, pred.pDraw, pred.pAway];
    if (probs.indexOf(Math.max(...probs)) === outcome) hits++;
    if (marketWon(pred.bestPick.key, hg, ag)) pickHits++;
    if (pred.safePick) {
      safePicks++;
      if (marketWon(pred.safePick.key, hg, ag)) {
        safeHits++;
        safeOddsWon += 1 / pred.safePick.p;
      }
    }
    brier += probs.reduce((s, p, i) => s + (p - (i === outcome ? 1 : 0)) ** 2, 0);

    // Baseline: historical H/D/A frequencies from matches before this one.
    const prior = done.filter((x) => x.utcDate < m.utcDate);
    const base = [0, 0, 0];
    for (const x of prior) base[x.homeGoals! > x.awayGoals! ? 0 : x.homeGoals === x.awayGoals ? 1 : 2]++;
    const tot = base[0] + base[1] + base[2] || 1;
    baseBrier += base.reduce((s, c, i) => s + (c / tot - (i === outcome ? 1 : 0)) ** 2, 0);
  }
  const n = tested.length;
  return {
    matches: n,
    resultHitRate: hits / n,
    bestPickHitRate: pickHits / n,
    brier: brier / n,
    baselineBrier: baseBrier / n,
    safePicks,
    safeHits,
    safeOddsWon,
  };
}

export function marketWon(key: string, hg: number, ag: number): boolean {
  const t = hg + ag;
  switch (key) {
    case "1": return hg > ag;
    case "X": return hg === ag;
    case "2": return hg < ag;
    case "1X": return hg >= ag;
    case "X2": return hg <= ag;
    case "12": return hg !== ag;
    case "O1.5": return t > 1.5;
    case "O2.5": return t > 2.5;
    case "O3.5": return t > 3.5;
    case "U2.5": return t < 2.5;
    case "U3.5": return t < 3.5;
    case "GG": return hg > 0 && ag > 0;
    case "NG": return hg === 0 || ag === 0;
    case "H0.5": return hg > 0;
    case "A0.5": return ag > 0;
    case "H1.5": return hg > 1;
    case "A1.5": return ag > 1;
    default: return false;
  }
}

function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x));
}
