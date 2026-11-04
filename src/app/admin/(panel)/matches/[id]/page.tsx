import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminMatchSkeleton } from "@/components/skeletons";
import { teams } from "@/lib/teams";
import { formatMatchDate } from "@/lib/videos/format";
import { getMatchState } from "./actions";
import { Editor } from "./editor";
import { StatusPanel } from "./status-panel";

export default function MatchPage({ params }: PageProps<"/admin/matches/[id]">) {
  return (
    <Suspense fallback={<AdminMatchSkeleton />}>
      <Match params={params} />
    </Suspense>
  );
}

async function Match({ params }: { params: Promise<{ id: string }> }) {
  // Admin pages are always rendered per request (session cookies, signed URLs).
  await connection();
  const { id } = await params;
  const state = await getMatchState(id);
  if (!state) notFound();
  const { project, video, view } = state;

  return (
    <div className="flex flex-col gap-3 sm:gap-5">
      <div className="flex flex-col gap-1 sm:gap-1.5">
        <Link href="/admin" className="inline-flex min-h-11 w-fit items-center text-sm font-semibold text-boys hover:underline sm:min-h-8">
          ← All matches
        </Link>
        <h1 className="font-display text-[48px] leading-[0.9] text-[#0e0e12] sm:text-[64px]">{project.title}</h1>
        <div className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-[#5b6070] sm:gap-2.5 sm:text-[15px]">
          <span className="rounded-full bg-[#e6ebf5] px-2 py-0.5 text-[11px] font-semibold text-boys sm:px-2.5 sm:py-[3px] sm:text-xs">{teams[project.team].name}</span>
          <span>
            {formatMatchDate(project.match_date)}
            {project.opponent ? ` · vs ${project.opponent}` : ""}
          </span>
        </div>
      </div>
      <StatusPanel projectId={project.id} team={project.team} teamName={teams[project.team].name} video={video} view={view} sourceSize={state.sourceSize} />
      {video?.status === "done" ? <Editor state={state} team={project.team} title={project.title} /> : null}
    </div>
  );
}
