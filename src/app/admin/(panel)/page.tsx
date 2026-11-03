import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { AdminContentSkeleton } from "@/components/skeletons";
import { requireMember } from "@/lib/auth/members";
import { TEAMS, type Team } from "@/lib/db/types";
import { listMatches } from "./actions";
import { MatchesTable } from "./matches-table";
import { TeamTabs } from "./team-tabs";

export default function AdminHomePage({ searchParams }: { searchParams: Promise<{ team?: string }> }) {
  return (
    <Suspense fallback={<AdminContentSkeleton />}>
      <Matches searchParams={searchParams} />
    </Suspense>
  );
}

async function Matches({ searchParams }: { searchParams: Promise<{ team?: string }> }) {
  // Admin pages are always rendered per request (session cookies, signed URLs).
  await connection();
  const member = await requireMember();
  const { team: teamParam } = await searchParams;
  const rows = await listMatches();
  const selected: Team = member.role === "admin" ? (TEAMS.includes(teamParam as Team) ? (teamParam as Team) : "girls") : (member.team ?? "girls");

  const header = (
    <div className="mb-6 flex items-center justify-between gap-4">
      <h1 className="font-display text-5xl leading-none tracking-wide text-neutral-900">Matches</h1>
      <Button render={<Link href={`/admin/matches/new?team=${selected}`} />} nativeButton={false} className="bg-boys text-white hover:bg-boys-deep">
        New match
      </Button>
    </div>
  );

  if (member.role !== "admin" && member.team) {
    return (
      <>
        {header}
        <MatchesTable rows={rows} />
      </>
    );
  }

  return (
    <>
      {header}
      <div className="flex flex-col gap-4">
        <TeamTabs selected={selected} />
        <MatchesTable rows={rows.filter((r) => r.project.team === selected)} />
      </div>
    </>
  );
}
