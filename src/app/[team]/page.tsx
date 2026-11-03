import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TeamPageSkeleton } from "@/components/skeletons";
import { MatchTile } from "@/components/match-tile";
import { TeamHeader } from "@/components/team-header";
import { getPublishedMatches } from "@/lib/videos/public";
import { isTeamSlug, teamSlugs, teams } from "@/lib/teams";

type Params = { team: string };

export function generateStaticParams() {
  return teamSlugs.map((team) => ({ team }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { team } = await params;
  if (!isTeamSlug(team)) return {};
  return { title: `${teams[team].name} · Videos` };
}

export default function TeamPage({
  params,
}: {
  params: Promise<Params>;
}) {
  return (
    <Suspense fallback={<TeamPageSkeleton />}>
      <TeamContent params={params} />
    </Suspense>
  );
}

async function TeamContent({ params }: { params: Promise<Params> }) {
  const { team: slug } = await params;
  if (!isTeamSlug(slug)) notFound();
  const team = teams[slug];
  // Signed URLs expire: always render this part at request time.
  await connection();
  const matches = await getPublishedMatches(slug);

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <TeamHeader team={team} backHref="/" backLabel="Back to home" />

      <main className="mx-auto flex w-full max-w-[1264px] flex-1 flex-col gap-8 px-5 pb-24 pt-10 sm:px-8 sm:pt-14">
        <h1 className="font-display text-[56px] leading-[0.9] text-[#0e0e12] sm:text-[72px]">
          Videos
        </h1>

        {matches.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
              <p className="text-lg font-semibold text-[#0e0e12]">No videos yet</p>
              <p className="max-w-sm text-[#6b6b76]">
                Matches and training sessions of the {team.name} are coming
                soon.
              </p>
            </CardContent>
          </Card>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] gap-x-8 gap-y-10">
            {matches.map((match) => (
              <li key={match.id}>
                <MatchTile match={match} teamSlug={team.slug} accentBg={team.bg} />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
