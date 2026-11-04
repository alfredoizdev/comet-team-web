import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { MatchCard } from "@/components/match-card";
import { MatchPageSkeleton } from "@/components/skeletons";
import { TeamHeader } from "@/components/team-header";
import { isTeamSlug, teams } from "@/lib/teams";
import { getPublishedMatch, getPublishedMatches, matchHeading } from "@/lib/videos/public";

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
  const [match, all] = await Promise.all([getPublishedMatch(slug, matchId), getPublishedMatches(slug)]);
  if (!match) notFound();
  const more = all.filter((m) => m.id !== match.id).slice(0, 3);

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <TeamHeader team={team} backHref={`/${slug}`} backLabel="All videos" />
      <main className="mx-auto w-full max-w-[1264px] flex-1 px-5 pb-12 pt-6 sm:px-8 md:pb-24 md:pt-10">
        <MatchCard match={match} team={team} more={more} />
      </main>
    </div>
  );
}
