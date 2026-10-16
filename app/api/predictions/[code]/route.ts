import { findCompetition, type CompetitionCode } from "@/lib/football";
import { getBoard } from "@/lib/predictions";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const comp = findCompetition((await params).code);
  if (!comp) return Response.json({ error: "Unknown competition" }, { status: 404 });
  return Response.json(await getBoard(comp.code as CompetitionCode));
}
