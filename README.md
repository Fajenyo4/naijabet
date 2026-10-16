# NaijaBet ⚽

Data-driven football predictions for Nigerian punters (Bet9ja, SportyBet, etc.) covering the
**Premier League, Champions League, La Liga, Serie A, Bundesliga, Ligue 1, Championship, Eredivisie and Primeira Liga**.

For every upcoming fixture it shows:

- **Home / Draw / Away** probabilities and the most likely correct score
- **Best pick**, meaning the most likely market that still pays at least 1.30 fair odds, with a confidence level
- Every market: 1X2, double chance (1X / X2 / 12), over/under 1.5–3.5, GG/NG, team to score, top correct scores
- **Fair odds** for each market. Type in the bookie's odds and the app tells you if the bet has **value**
- Last-5 **form** for both teams
- An **accumulator slip** that shows the real combined chance of all legs landing
- **Safe Picks** (`/safe`): only bets rated 80%+, with their real past hit rate and estimated return
- A **track record**, calculated by replaying past matches walk-forward, so you can see how accurate the model really is

## How the model works

`lib/model.ts` implements a time-weighted Dixon–Coles model:

1. Results from the current and previous season are weighted by age (half-life 120 days), so recent form dominates.
2. Each team gets an **attack** and **defence** rating, fitted iteratively and adjusted for opponent strength.
3. Ratings are shrunk towards average until a team has enough games (this stops early-season overreactions).
4. Expected goals → Poisson score matrix (with the Dixon–Coles low-score correction) → probabilities for every market.

### Auto-updating

The app pulls fixtures and results from [football-data.org](https://www.football-data.org) and caches them for 3 hours.
New results feed into the ratings automatically, with no redeploy needed.

## Deploy on Vercel

1. Get a free API key at <https://www.football-data.org/client/register>.
2. Import this repo at <https://vercel.com/new> (framework: Next.js, no other settings).
3. Under **Settings → Environment Variables** add `FOOTBALL_DATA_API_KEY`, then redeploy.

Without a key, the app runs on **clearly-labelled simulated demo data**.

## Local development

```bash
npm install
cp .env.example .env.local   # add your key
npm run dev                  # http://localhost:3000
npm test                     # model unit tests
```

JSON API: `GET /api/predictions/PL` (or `CL`, `PD`, `SA`, `BL1`, `FL1`, `ELC`, `DED`, `PPL`).

## ⚠️ Honest disclaimer

No model reliably beats bookmakers. Their odds already include most of this information plus a margin.
A well-built model typically gets the 1X2 result right around 50–55% of the time. Use this app to spot
mispriced odds and to avoid bad accumulators, not as a money printer. 18+ only. Bet only what you can afford to lose.
