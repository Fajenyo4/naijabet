import { unstable_cache } from "next/cache";
import { backtest, buildRatings, predict, recentForm, type Backtest, type FormResult, type Match, type Prediction } from "./model";
import { getCompetitionData, upcoming, type CompetitionCode } from "./football";

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

// Fitting ratings and replaying the backtest takes seconds, so finished boards are
// cached and shared between visitors instead of being recomputed on every page view.
const BOARD_CACHE_SECONDS = 60 * 60;

export async function getBoard(code: CompetitionCode): Promise<Board> {
  if (!process.env.FOOTBALL_DATA_API_KEY) return computeBoard(code);

  let fallback: Board | undefined;
  const cached = unstable_cache(
    async () => {
      const board = await computeBoard(code);
      if (board.source !== "live") {
        // Throwing keeps demo/error results out of the cache so the next visit retries.
        fallback = board;
        throw new Error(board.error ?? "live data unavailable");
      }
      return board;
    },
    ["board-v1", code],
    { revalidate: BOARD_CACHE_SECONDS },
  );
  try {
    return await cached();
  } catch {
    return fallback ?? computeBoard(code);
  }
}

async function computeBoard(code: CompetitionCode): Promise<Board> {
  const data = await getCompetitionData(code);
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
