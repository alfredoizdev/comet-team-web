import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
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
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-neutral-600 hover:underline">
          <ArrowLeft className="size-4" aria-hidden="true" /> All matches
        </Link>
        <h1 className="mt-2 font-display text-5xl leading-none tracking-wide text-neutral-900">{project.title}</h1>
        <p className="mt-1 text-neutral-600">
          {teams[project.team].name} · {formatMatchDate(project.match_date)}
          {project.opponent ? ` · vs ${project.opponent}` : ""}
        </p>
      </div>
      <StatusPanel projectId={project.id} video={video} view={view} sourceSize={state.sourceSize} />
      {video?.status === "done" ? <Editor state={state} team={project.team} /> : null}
    </div>
  );
}
