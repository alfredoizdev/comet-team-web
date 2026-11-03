import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminContentSkeleton } from "@/components/skeletons";
import { requireMember } from "@/lib/auth/members";
import { TEAMS, type Team } from "@/lib/db/types";
import { teams } from "@/lib/teams";
import { listMatches } from "./actions";
import { MatchesTable } from "./matches-table";

export default function AdminHomePage() {
  return (
    <Suspense fallback={<AdminContentSkeleton />}>
      <Matches />
    </Suspense>
  );
}

async function Matches() {
  // Admin pages are always rendered per request (session cookies, signed URLs).
  await connection();
  const member = await requireMember();
  const rows = await listMatches();

  const header = (
    <div className="mb-6 flex items-center justify-between gap-4">
      <h1 className="font-display text-5xl leading-none tracking-wide text-neutral-900">Matches</h1>
      <Button render={<Link href="/admin/matches/new" />} nativeButton={false} className="bg-boys text-white hover:bg-boys-deep">
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

  const byTeam = (team: Team) => rows.filter((r) => r.project.team === team);
  return (
    <>
      {header}
      <Tabs defaultValue="girls">
        <TabsList>
          {TEAMS.map((team) => (
            <TabsTrigger key={team} value={team}>
              {teams[team].name}
            </TabsTrigger>
          ))}
        </TabsList>
        {TEAMS.map((team) => (
          <TabsContent key={team} value={team} className="mt-4">
            <MatchesTable rows={byTeam(team)} />
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}
