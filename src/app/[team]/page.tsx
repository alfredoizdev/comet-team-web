import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Play } from "lucide-react";
import { TeamPageSkeleton } from "@/components/skeletons";
import { LatestMatch } from "@/components/latest-match";
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
  const [latest, ...earlier] = matches;

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <TeamHeader team={team} backHref="/" backLabel="Back to home" />

      <main className="mx-auto flex w-full max-w-[1264px] flex-1 flex-col gap-8 px-5 pb-24 pt-8 sm:px-8 sm:pt-12 md:gap-12">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-[56px] leading-[0.9] text-[#0e0e12] sm:text-[72px]">Videos</h1>
          {matches.length > 0 ? (
            <span className="text-sm text-[#6b6b76] sm:text-base">
              {matches.length} {matches.length === 1 ? "match" : "matches"}
            </span>
          ) : null}
        </div>

        {!latest ? (
          <div className="flex flex-col items-center gap-3.5 rounded-2xl border border-dashed border-[#c9ced8] px-6 py-12 text-center">
            <span className={`flex size-16 items-center justify-center rounded-full bg-[#eef1f7] ${team.text}`}>
              <Play className="ml-1 size-6 fill-current" />
            </span>
            <p className="font-display text-[32px] leading-none text-[#0e0e12]">No videos yet.</p>
            <p className="max-w-sm text-[15px] text-[#5b6070]">Matches of the {team.name} are coming soon.</p>
          </div>
        ) : (
          <>
            <LatestMatch match={latest} team={team} />
            {earlier.length > 0 ? (
              <section className="flex flex-col gap-5 border-t border-[#ececf0] pt-8 md:gap-6 md:pt-10">
                <h2 className="font-display text-[32px] leading-none text-[#0e0e12] sm:text-[40px]">Earlier matches</h2>
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-x-8 gap-y-8">
                  {earlier.map((match) => (
                    <li key={match.id}>
                      <MatchTile match={match} team={team} />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
