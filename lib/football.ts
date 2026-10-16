import type { Match, Team } from "./model";
import { readJSON, writeJSON } from "./store";

// Free tier of football-data.org covers all of these, including the Champions League.
export const COMPETITIONS = [
  { code: "PL", name: "Premier League", country: "England" },
  { code: "CL", name: "Champions League", country: "Europe" },
  { code: "PD", name: "La Liga", country: "Spain" },
  { code: "SA", name: "Serie A", country: "Italy" },
  { code: "BL1", name: "Bundesliga", country: "Germany" },
  { code: "FL1", name: "Ligue 1", country: "France" },
  { code: "ELC", name: "Championship", country: "England" },
  { code: "DED", name: "Eredivisie", country: "Netherlands" },
  { code: "PPL", name: "Primeira Liga", country: "Portugal" },
] as const;

export type CompetitionCode = (typeof COMPETITIONS)[number]["code"];

export function findCompetition(code: string) {
  return COMPETITIONS.find((c) => c.code === code.toUpperCase());
}

// Visitors never call football-data.org directly when stored data exists: a scheduled
// Netlify function (netlify/functions/refresh-data.mts) refreshes a few competitions
// every 10 minutes, staying inside the free tier's 10-requests-a-minute limit.
// Pages read the stored copy; they only call the API themselves when it is missing or old.
export const FRESH_FOR_MS = 90 * 60_000;

export interface CompetitionData {
  matches: Match[];
  source: "live" | "demo";
  error?: string;
  fetchedAt: string;
}

interface StoredCurrent {
  matches: Match[];
  fetchedAt: string;
}

const currentKey = (code: string) => `current/${code}`;
const seasonKey = (code: string, season: number) => `season/${code}/${season}`;

/** European seasons start in July/August; football-data.org names them by start year. */
export function currentSeasonStartYear(now = new Date()): number {
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

export async function getCompetitionData(code: CompetitionCode): Promise<CompetitionData> {
  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) {
    console.warn("[football-data] FOOTBALL_DATA_API_KEY is not set; serving demo data");
    return { matches: demoMatches(code), source: "demo", fetchedAt: new Date().toISOString() };
  }

  const stored = await readJSON<StoredCurrent>(currentKey(code));
  if (stored && Date.now() - new Date(stored.fetchedAt).getTime() < FRESH_FOR_MS) {
    return withPreviousSeason(code, stored, key);
  }
  try {
    return withPreviousSeason(code, await refreshCurrent(code, key), key);
  } catch (e) {
    if (stored) {
      // Rate-limited or API down: older real data beats simulated data.
      console.warn(`[football-data] ${code}: refresh failed, serving data from ${stored.fetchedAt}`, e);
      return withPreviousSeason(code, stored, key);
    }
    console.error(`[football-data] ${code}: falling back to demo data`, e);
    return {
      matches: demoMatches(code),
      source: "demo",
      error: e instanceof Error ? e.message : String(e),
      fetchedAt: new Date().toISOString(),
    };
  }
}

/** Fetches this season's fixtures and results and stores them. Throws on API errors. */
export async function refreshCurrent(code: CompetitionCode, key: string): Promise<StoredCurrent> {
  const fresh = { matches: await fetchSeason(code, currentSeasonStartYear(), key), fetchedAt: new Date().toISOString() };
  await writeJSON(currentKey(code), fresh);
  return fresh;
}

/**
 * Last season never changes, so it is fetched once and kept. If it can't be fetched yet
 * (e.g. rate-limited) ratings use this season alone and it is retried on a later request.
 */
async function previousSeason(code: CompetitionCode, key: string, fetchIfMissing: boolean): Promise<Match[] | null> {
  const season = currentSeasonStartYear() - 1;
  const stored = await readJSON<Match[]>(seasonKey(code, season));
  if (stored || !fetchIfMissing) return stored;
  try {
    const matches = await fetchSeason(code, season, key);
    await writeJSON(seasonKey(code, season), matches);
    return matches;
  } catch (e) {
    console.warn(`[football-data] ${code}: previous season unavailable for now`, e);
    return null;
  }
}

async function withPreviousSeason(code: CompetitionCode, current: StoredCurrent, key: string): Promise<CompetitionData> {
  const previous = (await previousSeason(code, key, true)) ?? [];
  return { matches: [...previous, ...current.matches], source: "live", fetchedAt: current.fetchedAt };
}

/** Used by the scheduled refresher: refreshes the stalest competitions first. */
export async function refreshStalest(maxRequests: number): Promise<string[]> {
  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) return ["no API key"];
  const ages = await Promise.all(
    COMPETITIONS.map(async (c) => {
      const s = await readJSON<StoredCurrent>(currentKey(c.code));
      return { code: c.code, age: s ? Date.now() - new Date(s.fetchedAt).getTime() : Infinity };
    }),
  );
  ages.sort((a, b) => b.age - a.age);

  const log: string[] = [];
  let used = 0;
  for (const { code, age } of ages) {
    if (used >= maxRequests) break;
    try {
      await assertNotThrottled();
      if (!(await previousSeason(code, key, false))) {
        used++;
        await previousSeason(code, key, true);
        if (used >= maxRequests) break;
      }
      used++;
      await refreshCurrent(code, key);
      log.push(`${code} refreshed (was ${age === Infinity ? "missing" : Math.round(age / 60_000) + " min old"})`);
    } catch (e) {
      log.push(`${code} ${e instanceof ThrottledError ? "skipped" : "failed"}: ${e instanceof Error ? e.message : e}`);
      break; // Rate-limited or API down: stop and let the next run continue.
    }
  }
  return log;
}

interface ApiTeam {
  id: number | null;
  name: string | null;
  shortName?: string | null;
  tla?: string | null;
  crest?: string | null;
}
interface ApiScore {
  duration?: string;
  fullTime?: { home: number | null; away: number | null };
  regularTime?: { home: number | null; away: number | null };
}
interface ApiMatch {
  id: number;
  utcDate: string;
  status: string;
  matchday?: number | null;
  stage?: string | null;
  homeTeam: ApiTeam;
  awayTeam: ApiTeam;
  score: ApiScore;
}

// --- Rate limiting ------------------------------------------------------------
// football-data.org reports its limit on every response:
//   X-Requests-Available-Minute (older APIs: X-RequestsAvailable): calls left in this minute
//   X-RequestCounter-Reset: seconds until that allowance resets
// When the allowance runs out (or a 429 arrives) we store a "don't call before" time in
// Blobs, so every page render and the scheduled refresher back off together.
const THROTTLE_KEY = "throttle";
const KEEP_SPARE = 1; // stop at 1 call left, so a burst can't tip us into 429s
let throttleUntil = 0; // this instance's copy of the shared back-off time

export class ThrottledError extends Error {}

async function assertNotThrottled() {
  if (Date.now() >= throttleUntil) {
    const shared = await readJSON<{ until: string }>(THROTTLE_KEY);
    if (shared) throttleUntil = Math.max(throttleUntil, Date.parse(shared.until));
  }
  if (Date.now() < throttleUntil) {
    throw new ThrottledError(`backing off for ${Math.ceil((throttleUntil - Date.now()) / 1000)}s (rate limit)`);
  }
}

async function backOff(seconds: number, reason: string) {
  throttleUntil = Date.now() + seconds * 1000;
  await writeJSON(THROTTLE_KEY, { until: new Date(throttleUntil).toISOString(), reason });
  console.warn(`[football-data] backing off ${seconds}s: ${reason}`);
}

export function readRateLimit(headers: Headers) {
  const num = (v: string | null) => (v !== null && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
  return {
    available: num(headers.get("x-requests-available-minute") ?? headers.get("x-requestsavailable")),
    resetSeconds: num(headers.get("x-requestcounter-reset")),
  };
}

async function fetchSeason(code: string, season: number, key: string): Promise<Match[]> {
  await assertNotThrottled();
  const res = await fetch(`https://api.football-data.org/v4/competitions/${code}/matches?season=${season}`, {
    headers: { "X-Auth-Token": key },
    cache: "no-store", // Freshness is managed by the stored copy (see FRESH_FOR_MS).
    signal: AbortSignal.timeout(8000), // A slow provider must never hang a page.
  });
  const { available, resetSeconds } = readRateLimit(res.headers);
  console.log(`[football-data] ${code} ${season}: HTTP ${res.status}, calls left this minute=${available ?? "?"}, resets in ${resetSeconds ?? "?"}s`);
  if (res.status === 429) {
    await backOff(resetSeconds ?? 60, `429 from API (${code} ${season})`);
    throw new ThrottledError(`football-data.org rate limit hit (${code} ${season})`);
  }
  if (available !== null && available <= KEEP_SPARE) await backOff(resetSeconds ?? 60, `only ${available} call(s) left this minute`);
  if (!res.ok) throw new Error(`football-data.org responded ${res.status} for ${code} ${season}`);
  const body = (await res.json()) as { matches?: ApiMatch[] };
  return (body.matches ?? []).flatMap(normalise);
}

function normalise(m: ApiMatch): Match[] {
  // Knockout ties with TBD opponents have null team ids — nothing to predict yet.
  if (m.homeTeam.id == null || m.awayTeam.id == null) return [];
  // For extra-time / penalty games, rate teams on the 90-minute score.
  const s = m.score.duration && m.score.duration !== "REGULAR" && m.score.regularTime ? m.score.regularTime : m.score.fullTime;
  return [
    {
      id: m.id,
      utcDate: m.utcDate,
      status: m.status,
      matchday: m.matchday,
      stage: m.stage,
      home: team(m.homeTeam),
      away: team(m.awayTeam),
      homeGoals: s?.home ?? null,
      awayGoals: s?.away ?? null,
    },
  ];
}

function team(t: ApiTeam): Team {
  const name = t.name ?? "Unknown";
  return { id: t.id!, name, shortName: t.shortName || t.tla || name, crest: t.crest ?? undefined };
}

export function upcoming(matches: Match[], now = new Date(), days = 10): Match[] {
  const from = now.getTime() - 2 * 3600_000; // keep games that kicked off in the last 2h
  const to = now.getTime() + days * 86_400_000;
  return matches
    .filter((m) => ["SCHEDULED", "TIMED", "IN_PLAY", "PAUSED"].includes(m.status))
    .filter((m) => {
      const t = new Date(m.utcDate).getTime();
      return t >= from && t <= to;
    })
    .sort((a, b) => a.utcDate.localeCompare(b.utcDate));
}

// ---------------------------------------------------------------------------
// Demo data — used only when no API key is configured (or the API is down).
// Results are SIMULATED from made-up team strengths; the UI labels them as such.
// ---------------------------------------------------------------------------

const DEMO_TEAMS: Record<string, string[]> = {
  PL: ["Arsenal", "Man City", "Liverpool", "Chelsea", "Man United", "Tottenham", "Newcastle", "Aston Villa", "Brighton", "West Ham", "Crystal Palace", "Fulham", "Brentford", "Everton", "Bournemouth", "Wolves", "Nottm Forest", "Leeds", "Burnley", "Sunderland"],
  CL: ["Real Madrid", "Man City", "Bayern", "Barcelona", "Arsenal", "Liverpool", "PSG", "Inter", "Dortmund", "Atlético", "Juventus", "Napoli", "Benfica", "Porto", "PSV", "Club Brugge", "Celtic", "Galatasaray"],
  PD: ["Real Madrid", "Barcelona", "Atlético", "Athletic", "Villarreal", "Real Sociedad", "Betis", "Sevilla", "Valencia", "Girona", "Celta", "Osasuna", "Mallorca", "Getafe", "Rayo", "Alavés", "Espanyol", "Levante", "Elche", "Oviedo"],
  SA: ["Inter", "Napoli", "Juventus", "Milan", "Atalanta", "Roma", "Lazio", "Fiorentina", "Bologna", "Como", "Torino", "Udinese", "Genoa", "Cagliari", "Lecce", "Parma", "Verona", "Sassuolo", "Pisa", "Cremonese"],
  BL1: ["Bayern", "Leverkusen", "Dortmund", "Leipzig", "Stuttgart", "Frankfurt", "Freiburg", "Wolfsburg", "Mainz", "Gladbach", "Union Berlin", "Hoffenheim", "Werder", "Augsburg", "Köln", "Hamburg", "Heidenheim", "St. Pauli"],
};

function demoMatches(code: string): Match[] {
  const names = DEMO_TEAMS[code] ?? DEMO_TEAMS.PL;
  let seed = [...code].reduce((s, c) => s * 31 + c.charCodeAt(0), 7) >>> 0;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const poissonSample = (l: number) => {
    let k = 0, p = 1;
    const L = Math.exp(-l);
    do { k++; p *= rand(); } while (p > L);
    return k - 1;
  };
  const teams = names.map((n, i) => ({
    team: { id: 900000 + i, name: n, shortName: n } as Team,
    // Earlier names in the list are stronger.
    att: 1.45 - (i / names.length) * 0.75 + (rand() - 0.5) * 0.15,
    def: 0.7 + (i / names.length) * 0.65 + (rand() - 0.5) * 0.15,
  }));

  const now = new Date();
  const nextSat = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + ((6 - now.getUTCDay() + 7) % 7 || 7), 14, 0));
  const out: Match[] = [];
  let id = 1;
  const rounds = 45;
  for (let r = 0; r < rounds; r++) {
    const order = [...teams].sort(() => rand() - 0.5);
    const date = new Date(nextSat.getTime() - (rounds - r) * 7 * 86_400_000);
    for (let i = 0; i + 1 < order.length; i += 2) {
      const h = order[i], a = order[i + 1];
      out.push({
        id: id++, utcDate: date.toISOString(), status: "FINISHED", matchday: r + 1,
        home: h.team, away: a.team,
        homeGoals: poissonSample(1.45 * h.att * a.def),
        awayGoals: poissonSample(1.15 * a.att * h.def),
      });
    }
  }
  const order = [...teams].sort(() => rand() - 0.5);
  for (let i = 0; i + 1 < order.length; i += 2) {
    const kickoff = new Date(nextSat.getTime() + (i % 4 === 0 ? 86_400_000 : 0) + ((i / 2) % 3) * 2.5 * 3600_000);
    out.push({
      id: id++, utcDate: kickoff.toISOString(), status: "TIMED", matchday: rounds + 1,
      home: order[i].team, away: order[i + 1].team, homeGoals: null, awayGoals: null,
    });
  }
  return out;
}
