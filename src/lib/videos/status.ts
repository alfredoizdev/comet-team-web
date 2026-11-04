import type { Video } from "@/lib/db/types";

export type VideoView = {
  label: string;
  tone: "neutral" | "progress" | "ok" | "error";
  canPublish: boolean;
  canCut: boolean;
  canReprocess: boolean;
};

type VideoLike = Pick<Video, "status" | "error_message" | "highlight_reel_path" | "source_deleted_at">;

/** Worker outcomes written as `status = error` with a machine-readable message. */
const ERROR_LABELS: Record<string, string> = {
  no_audio: "No usable audio",
  no_peaks: "No highlights found",
  no_clips: "No clips left",
};

const NONE: VideoView = { label: "No video", tone: "neutral", canPublish: false, canCut: false, canReprocess: false };

/** Maps PeakClip's status conventions to what the admin panel shows and allows. */
export function describeVideo(video: VideoLike | null): VideoView {
  if (!video) return NONE;
  const hasSource = !video.source_deleted_at;

  switch (video.status) {
    case "uploaded":
      return { label: "Queued", tone: "progress", canPublish: false, canCut: false, canReprocess: false };
    case "processing":
      // Reprocess stays available so a job killed mid-way (worker restart) can be restarted.
      return { label: "Processing", tone: "progress", canPublish: false, canCut: false, canReprocess: hasSource };
    case "done":
      if (video.highlight_reel_path) {
        return { label: "Ready", tone: "ok", canPublish: true, canCut: hasSource, canReprocess: hasSource };
      }
      return { label: "Rebuilding highlight reel", tone: "progress", canPublish: false, canCut: hasSource, canReprocess: hasSource };
    case "error":
      return {
        label: ERROR_LABELS[video.error_message ?? ""] ?? "Failed",
        tone: "error",
        canPublish: false,
        canCut: false,
        canReprocess: hasSource,
      };
  }
}
