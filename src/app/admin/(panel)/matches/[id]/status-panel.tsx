"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { VideoView } from "@/lib/videos/status";
import type { Team, Video } from "@/lib/db/types";
import { formatGigabytes } from "@/lib/videos/format";
import { deleteMatch, deleteOriginal, reprocessMatch, setPublished } from "../../actions";

const btn = {
  primary: "inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-boys px-[18px] text-sm font-semibold text-white transition hover:bg-boys-deep disabled:opacity-50 sm:min-h-10",
  outline: "inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-[#d5d9e2] bg-white px-3.5 text-sm font-semibold text-[#0e0e12] transition hover:bg-[#f4f5f8] disabled:opacity-50 sm:min-h-10",
  outlineNavy: "inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-boys bg-white px-3.5 text-sm font-semibold text-boys transition hover:bg-[#f4f5f8] disabled:opacity-50 sm:min-h-10",
  danger: "inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-[#f6c9c5] bg-[#fdecec] px-3.5 text-sm font-semibold text-[#b42318] transition hover:bg-[#fbdcdc] disabled:opacity-50 sm:min-h-10",
};

/** Status pill of the design: green dot for Ready, spinner while the worker runs. */
function StatusBadge({ view, spinning }: { view: VideoView; spinning: boolean }) {
  const tone =
    view.tone === "ok"
      ? "bg-[#e3f5ea] text-[#146c3a]"
      : view.tone === "progress"
        ? "bg-[#fff4db] text-[#7a4a00]"
        : view.tone === "error"
          ? "bg-[#fdecec] text-[#b42318]"
          : "bg-[#eef0f4] text-[#5b6070]";
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-semibold ${tone}`}>
      {view.tone === "ok" ? <span className="size-[7px] rounded-full bg-[#1f9d55]" aria-hidden="true" /> : null}
      {spinning ? <Loader2 className="size-[13px] animate-spin" aria-hidden="true" /> : null}
      {view.label}
    </span>
  );
}

export function StatusPanel({
  projectId,
  team,
  teamName,
  video,
  view,
  sourceSize,
}: {
  projectId: string;
  team: Team;
  teamName: string;
  video: Video | null;
  view: VideoView;
  sourceSize?: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // While the worker is busy, refresh every 5 s (PeakClip polled the same way).
  useEffect(() => {
    if (view.tone !== "progress" && !video?.stage) return;
    const id = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(id);
  }, [view.tone, video?.stage, router]);

  function run(label: string, fn: () => Promise<void>, after?: () => void) {
    startTransition(async () => {
      try {
        await fn();
        toast.success(label);
        if (after) after();
        else router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  if (!video) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-[#e3e6ec] bg-white px-4 py-3.5 sm:px-5">
        <StatusBadge view={view} spinning={false} />
        <span className="text-sm text-[#5b6070]">This match has no video yet.</span>
      </div>
    );
  }

  // Show the bar whenever the worker has reported a stage, even if a later restart flipped the status back to queued.
  const working = (view.tone === "progress" && (video.status === "processing" || !!video.stage)) || (video.status === "done" && !!video.stage);
  const queued = video.status === "uploaded" && !video.stage;
  const failed = video.status === "error";
  const pct = working ? Math.max(0, Math.min(100, video.progress ?? 0)) : null;
  const newMatchHref = `/admin/matches/new?team=${team}`;

  const helper = failed
    ? video.error_message === "no_audio"
      ? "This video has no usable audio, so no highlights could be detected. Delete the match or reprocess it."
      : video.error_message === "no_peaks"
        ? "No highlights were found in the audio. Delete the match or reprocess it."
        : video.error_message === "no_clips"
          ? "Every clip was deleted. Reprocess the match to detect highlights again."
          : "Processing stopped before finishing. Try again."
    : video.status === "done" && video.reel_stale
      ? "The highlight reel is being updated. The current one keeps playing until the new one is ready."
      : video.error_message?.startsWith("hls_failed")
        ? "The full match could not be prepared for streaming. Reprocess the match to try again."
        : video.status === "done" && video.stage
          ? "Highlights are ready and can be published. The full match is being prepared for streaming in the background."
          : video.status === "done"
            ? video.is_published
              ? `Families can watch it on the ${teamName} page.`
              : "Review the clips, then publish so families can watch."
            : null;

  const reprocess = (
    <AlertDialog>
      <AlertDialogTrigger render={<button type="button" className={failed ? btn.primary : btn.outline} disabled={pending || !view.canReprocess} />}>
        {video.status === "processing" ? "Restart processing" : "Reprocess"}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{video.status === "processing" ? "Restart processing?" : "Reprocess this match?"}</AlertDialogTitle>
          <AlertDialogDescription>
            {video.status === "processing"
              ? "Only do this if the worker got stuck (for example after a restart). Partial clips are discarded and the match is queued again."
              : "All clips and the highlight reel are discarded and the match is queued again."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => run("Queued again", () => reprocessMatch(video.id))}>Continue</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  const deleteMatchButton = (
    <AlertDialog>
      <AlertDialogTrigger render={<button type="button" className={btn.danger} disabled={pending} />}>Delete match</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this match?</AlertDialogTitle>
          <AlertDialogDescription>This removes the video, its clips and the highlight reel. It can&apos;t be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => run("Match deleted", () => deleteMatch(projectId), () => router.push("/admin"))}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return (
    <div className="flex flex-col gap-3">
      {video.source_deleted_at ? (
        <div role="note" className="flex items-start gap-2.5 rounded-[10px] border border-[#d5d9e2] bg-white px-3.5 py-3 text-sm font-medium leading-[1.45] text-[#0e0e12]">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-[#5b6070]" aria-hidden="true" />
          <span>
            {video.hls_path
              ? "The original file was deleted. The match keeps streaming from its web copy, but new clips can't be cut."
              : "The full match was removed after processing, so new clips can't be cut."}
          </span>
        </div>
      ) : null}

      <div className={`flex flex-col gap-3 rounded-xl border bg-white p-3 sm:px-5 sm:py-3.5 ${failed ? "border-[#f6c9c5]" : "border-[#e3e6ec]"}`}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
            <StatusBadge view={view} spinning={working} />
            {video.is_published ? <span className="rounded-full bg-boys px-2.5 py-1 text-[13px] font-semibold text-white">Published</span> : null}
            {helper ? <span className={`text-[13px] sm:text-sm ${failed ? "text-[#0e0e12]" : "text-[#5b6070]"}`}>{helper}</span> : null}
          </div>

          <div className="-mx-3 flex gap-2 overflow-x-auto px-3 md:mx-0 md:flex-wrap md:justify-end md:overflow-visible md:px-0">
            {working ? (
              <Link href={newMatchHref} className={btn.outline}>
                New match
              </Link>
            ) : queued ? (
              <Link href={newMatchHref} className={btn.outline}>
                Queue another match
              </Link>
            ) : null}
            {video.status === "done" ? (
              <button
                type="button"
                className={video.is_published ? btn.outlineNavy : btn.primary}
                disabled={pending || (!video.is_published && !view.canPublish)}
                onClick={() => run(video.is_published ? "Unpublished" : "Published", () => setPublished(video.id, !video.is_published))}
              >
                {video.is_published ? "Unpublish" : "Publish"}
              </button>
            ) : null}
            {!queued ? reprocess : null}
            {video.status === "done" && video.hls_path && !video.source_deleted_at && !video.source_url ? (
              <AlertDialog>
                <AlertDialogTrigger render={<button type="button" className={btn.outline} disabled={pending} />}>
                  Delete original{sourceSize ? ` (${formatGigabytes(sourceSize)})` : ""}
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete the original file?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Frees{sourceSize ? ` ${formatGigabytes(sourceSize)} of` : ""} storage. The full match keeps streaming and all clips stay, but new clips can&apos;t be cut from this match anymore. It can&apos;t be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => run("Original deleted", () => deleteOriginal(video.id))}>Delete original</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
            {deleteMatchButton}
          </div>
        </div>

        {working ? (
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-sm font-medium text-[#0e0e12]">
              <span>{video.stage ?? "Starting…"}</span>
              <span className="font-mono font-semibold">{pct}%</span>
            </div>
            <div role="progressbar" aria-valuenow={pct ?? 0} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded-full bg-[#eef0f4]">
              <div className="h-full bg-boys transition-[width] duration-500" style={{ width: `${pct ?? 0}%` }} />
            </div>
            {video.status !== "done" ? (
              <span className="text-[13px] text-[#5b6070]">The editor opens when processing finishes. You can queue another match meanwhile.</span>
            ) : null}
          </div>
        ) : null}
        {queued ? (
          <span className="text-[13px] text-[#5b6070]">
            Waiting for the worker to pick this match up. If it stays here, make sure the worker is running on the Mac.
          </span>
        ) : null}
      </div>
    </div>
  );
}
