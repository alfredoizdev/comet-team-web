"use client";

import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { VideoView } from "@/lib/videos/status";
import type { Video } from "@/lib/db/types";
import { deleteMatch, reprocessMatch, setPublished } from "../../actions";

const toneClass: Record<VideoView["tone"], string> = {
  neutral: "bg-neutral-200 text-neutral-700",
  progress: "bg-amber-100 text-amber-800",
  ok: "bg-emerald-100 text-emerald-800",
  error: "bg-red-100 text-red-800",
};

export function StatusPanel({ projectId, video, view }: { projectId: string; video: Video | null; view: VideoView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // While the worker is busy, refresh every 5 s (PeakClip polled the same way).
  useEffect(() => {
    if (view.tone !== "progress") return;
    const id = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(id);
  }, [view.tone, router]);

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

  const note =
    video?.status === "error" && video.error_message === "no_audio"
      ? "This video has no usable audio, so no highlights could be detected. You can delete the match or reprocess it."
      : video?.status === "error"
        ? `Processing failed: ${video.error_message ?? "unknown error"}.`
        : video?.source_deleted_at
          ? "The full match was removed after processing, so new clips can't be cut."
          : view.tone === "progress"
            ? "The worker is processing this match. This page refreshes on its own."
            : null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <Badge className={toneClass[view.tone]}>{view.label}</Badge>
        {video?.is_published ? <Badge className="bg-boys text-white">Published</Badge> : null}
        {note ? <p className="text-sm text-neutral-600">{note}</p> : null}
      </div>
      {video ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={video.is_published ? "outline" : "default"}
            disabled={pending || (!video.is_published && !view.canPublish)}
            className={video.is_published ? "" : "bg-boys text-white hover:bg-boys-deep"}
            onClick={() => run(video.is_published ? "Unpublished" : "Published", () => setPublished(video.id, !video.is_published))}
          >
            {video.is_published ? "Unpublish" : "Publish"}
          </Button>
          <Button size="sm" variant="outline" disabled={pending || !view.canReprocess} onClick={() => run("Reprocessing", () => reprocessMatch(video.id))}>
            Reprocess
          </Button>
          <AlertDialog>
            <AlertDialogTrigger render={<Button size="sm" variant="destructive" disabled={pending} />}>Delete match</AlertDialogTrigger>
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
        </div>
      ) : null}
    </div>
  );
}
