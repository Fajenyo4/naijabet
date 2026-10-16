import type { Match, Team } from "./model";

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

// Data refreshes automatically: cached results are re-fetched at most every 3 hours,
// so new results feed straight into the ratings without anyone redeploying.
export const REVALIDATE_SECONDS = 60 * 60 * 3;

export interface CompetitionData {
  matches: Match[];
  source: "live" | "demo";
  error?: string;
  fetchedAt: string;
}

/** European seasons start in July/August; football-data.org names them by start year. */
export function currentSeasonStartYear(now = new Date()): number {
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

export async function getCompetitionData(code: CompetitionCode): Promise<CompetitionData> {
  const key = process.env.FOOTBALL_DATA_API_KEY;
  const fetchedAt = new Date().toISOString();
  if (!key) return { matches: demoMatches(code), source: "demo", fetchedAt };

  const season = currentSeasonStartYear();
  try {
    // Current + previous season: enough history for ratings early in the season.
    const [current, previous] = await Promise.all([
      fetchSeason(code, season, key),
      fetchSeason(code, season - 1, key).catch(() => [] as Match[]),
    ]);
    return { matches: [...previous, ...current], source: "live", fetchedAt };
  } catch (e) {
    return {
      matches: demoMatches(code),
      source: "demo",
      error: e instanceof Error ? e.message : String(e),
      fetchedAt,
    };
  }
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

async function fetchSeason(code: string, season: number, key: string): Promise<Match[]> {
  const res = await fetch(`https://api.football-data.org/v4/competitions/${code}/matches?season=${season}`, {
    headers: { "X-Auth-Token": key },
    next: { revalidate: REVALIDATE_SECONDS },
  });
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
