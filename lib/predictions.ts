import { unstable_cache } from "next/cache";
import { backtest, buildRatings, predict, recentForm, type Backtest, type FormResult, type Match, type Prediction } from "./model";
import { getCompetitionData, upcoming, type CompetitionCode, type CompetitionData } from "./football";

export interface Fixture {
  match: Match;
  prediction: Prediction;
  homeForm: FormResult[];
  awayForm: FormResult[];
}

export interface Board {
  code: CompetitionCode;
  source: "live" | "demo";
  error?: string;
  fetchedAt: string;
  finishedCount: number;
  fixtures: Fixture[];
  backtest: Backtest | null;
}

// Fitting ratings and replaying the backtest takes a moment, so boards are cached and
// shared between visitors. The key includes when the data was fetched, so a board is
// recomputed exactly when new results arrive. Demo boards are never cached.
const BOARD_CACHE_SECONDS = 60 * 60 * 3;

export async function getBoard(code: CompetitionCode): Promise<Board> {
  const t0 = Date.now();
  const data = await getCompetitionData(code);
  const t1 = Date.now();
  const board =
    data.source !== "live"
      ? await computeBoard(code, data)
      : await unstable_cache(async () => computeBoard(code, data), ["board-v2", code, data.fetchedAt], {
          revalidate: BOARD_CACHE_SECONDS,
        })();
  console.log(`[board] ${code} ${data.source} data=${t1 - t0}ms board=${Date.now() - t1}ms`);
  return board;
}

async function computeBoard(code: CompetitionCode, data: CompetitionData): Promise<Board> {
  const now = new Date();
  const ratings = buildRatings(data.matches, now);
  const fixtures = upcoming(data.matches, now).map((match) => ({
    match,
    prediction: predict(match, ratings),
    homeForm: recentForm(data.matches, match.home.id),
    awayForm: recentForm(data.matches, match.away.id),
  }));
  return {
    code,
    source: data.source,
    error: data.error,
    fetchedAt: data.fetchedAt,
    finishedCount: data.matches.filter((m) => m.status === "FINISHED").length,
    fixtures,
    backtest: backtest(data.matches),
  };
}
