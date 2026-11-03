import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { MatchCard } from "@/components/match-card";
import { MatchPageSkeleton } from "@/components/skeletons";
import { TeamHeader } from "@/components/team-header";
import { isTeamSlug, teams } from "@/lib/teams";
import { getPublishedMatch, matchHeading } from "@/lib/videos/public";

type Params = { team: string; matchId: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { team, matchId } = await params;
  if (!isTeamSlug(team)) return {};
  const match = await getPublishedMatch(team, matchId);
  return { title: match ? `${matchHeading(match)} · ${teams[team].name}` : teams[team].name };
}

export default function PublicMatchPage({ params }: { params: Promise<Params> }) {
  return (
    <Suspense fallback={<MatchPageSkeleton />}>
      <MatchContent params={params} />
    </Suspense>
  );
}

async function MatchContent({ params }: { params: Promise<Params> }) {
  const { team: slug, matchId } = await params;
  if (!isTeamSlug(slug)) notFound();
  const team = teams[slug];
  await connection();
  const match = await getPublishedMatch(slug, matchId);
  if (!match) notFound();

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <TeamHeader team={team} backHref={`/${slug}`} backLabel="All videos" />
      <main className="mx-auto w-full max-w-[1264px] flex-1 px-5 pb-24 pt-10 sm:px-8 sm:pt-14">
        <MatchCard match={match} accentBg={team.bg} />
      </main>
    </div>
  );
}
