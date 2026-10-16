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

export async function getBoard(code: CompetitionCode): Promise<Board> {
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
