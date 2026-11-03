"use client";

import Link from "next/link";
import { useTransition } from "react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMatchDate } from "@/lib/videos/format";
import { VideoPoster } from "@/components/video-poster";
import { describeVideo, type VideoView } from "@/lib/videos/status";
import { deleteMatch, setPublished, type MatchListRow } from "./actions";

const toneClass: Record<VideoView["tone"], string> = {
  neutral: "bg-neutral-200 text-neutral-700",
  progress: "bg-amber-100 text-amber-800",
  ok: "bg-emerald-100 text-emerald-800",
  error: "bg-red-100 text-red-800",
};

export function MatchesTable({ rows }: { rows: MatchListRow[] }) {
  const [pending, startTransition] = useTransition();

  function run(label: string, fn: () => Promise<void>) {
    startTransition(async () => {
      try {
        await fn();
        toast.success(label);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  if (rows.length === 0) {
    return <p className="rounded-xl border border-dashed border-neutral-300 p-10 text-center text-neutral-600">No matches yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Match</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Opponent</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Clips</TableHead>
            <TableHead>Published</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ project, video, clipCount, thumbUrl }) => {
            const view = describeVideo(video);
            return (
              <TableRow key={project.id}>
                <TableCell className="font-medium">
                  <Link href={`/admin/matches/${project.id}`} className="flex items-center gap-3 hover:underline">
                    <span className="relative block aspect-video w-28 shrink-0 overflow-hidden rounded-md bg-neutral-200">
                      {thumbUrl ? (
                        <VideoPoster src={thumbUrl} muted preload="metadata" playsInline className="size-full object-cover" />
                      ) : (
                        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium uppercase text-neutral-500">
                          {video ? "Processing" : "No video"}
                        </span>
                      )}
                    </span>
                    <span>{project.title}</span>
                  </Link>
                </TableCell>
                <TableCell>{formatMatchDate(project.match_date)}</TableCell>
                <TableCell>{project.opponent ?? "—"}</TableCell>
                <TableCell>
                  <Badge className={toneClass[view.tone]}>{view.label}</Badge>
                </TableCell>
                <TableCell>{video ? clipCount : "—"}</TableCell>
                <TableCell>
                  {video ? (
                    <Button
                      size="sm"
                      variant={video.is_published ? "outline" : "default"}
                      disabled={pending || (!video.is_published && !view.canPublish)}
                      onClick={() =>
                        run(video.is_published ? "Unpublished" : "Published", () => setPublished(video.id, !video.is_published))
                      }
                    >
                      {video.is_published ? "Unpublish" : "Publish"}
                    </Button>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button render={<Link href={`/admin/matches/${project.id}`} />} nativeButton={false} size="sm" variant="outline">
                      Open
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger render={<Button size="sm" variant="destructive" disabled={pending} />}>
                        Delete
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this match?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This removes the video, its clips and the highlight reel. It can&apos;t be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => run("Match deleted", () => deleteMatch(project.id))}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
