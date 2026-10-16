import { findCompetition } from "@/lib/football";
import CompetitionView from "@/components/CompetitionView";

// Render per request from stored data, which a scheduled function keeps fresh
// (see lib/football.ts), so new results flow in automatically.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const comp = findCompetition((await params).code);
  return { title: comp ? `${comp.name} predictions – NaijaBet` : "NaijaBet" };
}

export default async function CompetitionPage({ params }: { params: Promise<{ code: string }> }) {
  return <CompetitionView code={(await params).code} />;
}
