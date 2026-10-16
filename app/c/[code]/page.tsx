import { findCompetition } from "@/lib/football";
import CompetitionView from "@/components/CompetitionView";

// Render per request; the upstream API responses themselves are cached for 3h
// (see REVALIDATE_SECONDS), so new results flow in automatically.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const comp = findCompetition((await params).code);
  return { title: comp ? `${comp.name} predictions – NaijaBet AI` : "NaijaBet AI" };
}

export default async function CompetitionPage({ params }: { params: Promise<{ code: string }> }) {
  return <CompetitionView code={(await params).code} />;
}
