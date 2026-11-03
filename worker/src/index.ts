// Ported from PeakClip apps/worker/src/index.ts without overlays and AI analysis.
import { createClient } from "@supabase/supabase-js";
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
  // Only videos that still have a ready clip; a video with none would otherwise
  // match every poll and block regeneration for everyone else.
  const { data: videos, error } = await supabase
    .from("videos")
    .select("id, clips!inner(id)")
    .eq("status", "done")
    .is("highlight_reel_path", null)
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

poll();
