// Ported from PeakClip apps/worker/src/index.ts without overlays and AI analysis.
import { createClient } from "@supabase/supabase-js";
import { generateHls } from "./hls";
import { processCustomClip, processVideo, regenerateHighlightReel } from "./process";

const POLL_INTERVAL = 5000;

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function claimNextVideo() {
  const { data, error } = await supabase.rpc("claim_next_video");
  if (error) {
    console.error("Error claiming video:", error.message);
    return null;
  }
  return data?.[0] ?? null;
}

async function processCustomClips() {
  const { data: clips, error } = await supabase
    .from("clips")
    .select("id, video_id, start_time, end_time, file_path, score")
    .like("file_path", "%/custom_%")
    .eq("score", 0)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error || !clips || clips.length === 0) return;
  const clip = clips[0];

  const { data: video } = await supabase.from("videos").select("file_path, source_url, source_deleted_at").eq("id", clip.video_id).single();
  if (!video || video.source_deleted_at) {
    console.error(`[custom_clip:${clip.id}] Source video unavailable`);
    await supabase.from("clips").update({ score: -1 }).eq("id", clip.id);
    return;
  }

  console.log(`Processing custom clip: ${clip.id}`);
  try {
    await processCustomClip(clip, video);
    await supabase.from("clips").update({ score: 1 }).eq("id", clip.id);
    console.log(`Regenerating highlight reel for video: ${clip.video_id}`);
    await regenerateHighlightReel(clip.video_id);
  } catch (err) {
    console.error(`Error processing custom clip ${clip.id}:`, message(err));
    await supabase.from("clips").update({ score: -1 }).eq("id", clip.id);
  }
}

async function regenerateStaleReels() {
  // Reels missing (null) or flagged stale after a clip deletion. Only videos that
  // still have a ready clip; one with none would match every poll forever.
  const { data: videos, error } = await supabase
    .from("videos")
    .select("id, clips!inner(id)")
    .eq("status", "done")
    .or("highlight_reel_path.is.null,reel_stale.eq.true")
    .gt("clips.score", 0)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error || !videos || videos.length === 0) return;
  const video = videos[0];

  console.log(`Regenerating stale highlight reel for video: ${video.id}`);
  try {
    await regenerateHighlightReel(video.id);
  } catch (err) {
    console.error(`Error regenerating reel for ${video.id}:`, message(err));
  }
}

/**
 * Streaming copy for finished uploads whose master is still in R2 and that have no
 * HLS yet. Runs after clips/reels so highlights are never delayed by a 30-minute encode.
 * A failure is recorded as `error_message = hls_failed: …` (status stays done; Reprocess clears it).
 */
async function generatePendingHls() {
  const { data: videos, error } = await supabase
    .from("videos")
    .select("id, file_path, duration")
    .eq("status", "done")
    .is("source_url", null)
    .is("source_deleted_at", null)
    .is("hls_path", null)
    .is("error_message", null)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error || !videos || videos.length === 0) return;
  const video = videos[0];

  console.log(`Preparing full match for streaming: ${video.id}`);
  try {
    await generateHls(video);
  } catch (err) {
    console.error(`Error preparing HLS for ${video.id}:`, message(err));
    await supabase.from("videos").update({ error_message: `hls_failed: ${message(err).slice(0, 300)}`, stage: null }).eq("id", video.id);
  }
}

async function poll() {
  console.log("Comets worker started. Polling for videos...");
  while (true) {
    try {
      const video = await claimNextVideo();
      if (video) {
        console.log(`Processing video: ${video.id}`);
        try {
          await processVideo(video.id, video);
        } catch (err) {
          console.error(`Error processing ${video.id}:`, message(err));
          await supabase.from("videos").update({ status: "error", error_message: message(err), stage: null }).eq("id", video.id);
        }
      }
      await processCustomClips();
      await regenerateStaleReels();
    } catch (err) {
      console.error("Poll error:", message(err));
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }
}

/** Second lane: streaming copies. Independent of the clips lane, one encode at a time. */
async function pollHls() {
  while (true) {
    try {
      await generatePendingHls();
    } catch (err) {
      console.error("HLS poll error:", message(err));
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }
}

poll();
pollHls();
