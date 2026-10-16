import type { Config } from "@netlify/functions";
import { refreshStalest } from "../../lib/football";

// Keeps stored football data fresh so visitors never hit football-data.org's
// 10-requests-a-minute free-tier limit. 4 requests every 10 minutes refreshes all
// competitions roughly every 25 minutes and leaves headroom for on-demand fetches.
export default async () => {
  const log = await refreshStalest(4);
  console.log("[refresh-data]", log.join("; ") || "nothing to do");
};

export const config: Config = { schedule: "*/10 * * * *" };
