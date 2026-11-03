import { connection } from "next/server";
import { Suspense } from "react";
import { requireMember } from "@/lib/auth/members";
import { TEAMS, type Team } from "@/lib/db/types";
import { listOpponents } from "../../actions";
import { UploadForm } from "./upload-form";

export default function NewMatchPage({ searchParams }: { searchParams: Promise<{ team?: string }> }) {
  return (
    <Suspense fallback={null}>
      <NewMatch searchParams={searchParams} />
    </Suspense>
  );
}

async function NewMatch({ searchParams }: { searchParams: Promise<{ team?: string }> }) {
  // Admin pages are always rendered per request (session cookies, signed URLs).
  await connection();
  const member = await requireMember();
  const { team: teamParam } = await searchParams;
  const defaultTeam: Team =
    member.role === "admin" ? (TEAMS.includes(teamParam as Team) ? (teamParam as Team) : "girls") : (member.team ?? "girls");
  const opponents = await listOpponents();
  return (
    <>
      <h1 className="mb-6 font-display text-5xl leading-none tracking-wide text-neutral-900">New match</h1>
      <UploadForm role={member.role} team={member.team} defaultTeam={defaultTeam} opponents={opponents} />
    </>
  );
}
