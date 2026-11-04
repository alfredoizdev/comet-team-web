// Ported from PeakClip apps/worker/src/process.ts. Same FFmpeg pipeline;
// storage calls go to Cloudflare R2 instead of Supabase Storage, and the
// full match is deleted from R2 once clips + reel exist (see DELETE_SOURCE_AFTER_PROCESSING).
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { analyzeAudio, findTopPeaks, hasUsefulAudio } from "./audio";
import { autoClipKey, deleteObjects, downloadToFile, reelKey, uploadFile } from "./storage";

const execAsync = promisify(execFile);
/** ffmpeg/ffprobe never read stdin and always overwrite: a leftover file must never make them wait for "y/N". */
const exec = (cmd: string, args: string[]) =>
  execAsync(cmd, cmd === "ffmpeg" ? ["-nostdin", "-y", ...args] : args, { maxBuffer: 50 * 1024 * 1024, timeout: 1_800_000 });

const TMP_ROOT = join("/tmp", "peakclip");
const CLIP_BEFORE_SECONDS = 5;
const CLIP_AFTER_SECONDS = 10;

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function deleteSourceEnabled(): boolean {
  return process.env.DELETE_SOURCE_AFTER_PROCESSING !== "false";
}

export type VideoSource = { file_path: string; source_url?: string | null };

/** Writes the current stage/progress on the video row (best effort; shown in the admin panel). */
function progressReporter(videoId: string) {
  const supabase = getSupabase();
  let last = "";
  return async (stage: string, progress: number) => {
    const key = `${stage}|${progress}`;
    if (key === last) return;
    last = key;
    await supabase.from("videos").update({ stage, progress: Math.max(0, Math.min(100, Math.round(progress))) }).eq("id", videoId);
  };
}

/** Runs yt-dlp, mapping its "[download]  42.3%" lines to `onPct`. */
function ytDlp(url: string, destPath: string, onPct: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("yt-dlp", [
      "--no-update", "--newline", "--no-playlist",
      "-f", "bv*[ext=mp4][height<=1080]+ba[ext=m4a]/b[ext=mp4]/b",
      "--merge-output-format", "mp4",
      "-o", destPath,
      url,
    ]);
    let stderr = "";
    child.stdout.on("data", (buf: Buffer) => {
      for (const line of buf.toString().split("\n")) {
        const m = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
        if (m) onPct(parseFloat(m[1]));
      }
    });
    child.stderr.on("data", (buf: Buffer) => {
      stderr += buf.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`yt-dlp exited with ${code}: ${stderr.slice(-800)}`))));
  });
}

/** Puts the full match at `destPath`: from YouTube with yt-dlp, or from R2. Reports 0–100 of the download. */
async function fetchSource(source: VideoSource, destPath: string, tag: string, onPct: (pct: number) => void = () => {}) {
  if (source.source_url) {
    console.log(`[${tag}] Downloading from YouTube: ${source.source_url}`);
    await ytDlp(source.source_url, destPath, onPct);
    return;
  }
  await downloadToFile(source.file_path, destPath, onPct);
}

async function cutClip(inputPath: string, start: number, end: number, outPath: string) {
  await exec("ffmpeg", [
    "-ss", start.toString(),
    "-to", end.toString(),
    "-i", inputPath,
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-c:a", "aac",
    "-y",
    outPath,
  ]);
}

async function concatClips(clipPaths: string[], listPath: string, outPath: string) {
  writeFileSync(listPath, clipPaths.map((p) => `file '${p}'`).join("\n"));
  await exec("ffmpeg", ["-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", "-y", outPath]);
}

export async function processCustomClip(
  clip: { id: string; video_id: string; start_time: number; end_time: number; file_path: string },
  source: VideoSource,
) {
  const report = progressReporter(clip.video_id);
  const tmpDir = join(TMP_ROOT, `custom_${clip.id}`);
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });
  try {
    const inputPath = join(tmpDir, "input.mp4");
    const clipPath = join(tmpDir, "clip.mp4");

    console.log(`[custom_clip:${clip.id}] Downloading video...`);
    await report("Downloading video for the new clip", 0);
    await fetchSource(source, inputPath, `custom_clip:${clip.id}`, (pct) => void report("Downloading video for the new clip", pct * 0.8));
    await report("Cutting the new clip", 85);

    console.log(`[custom_clip:${clip.id}] Cutting ${clip.start_time.toFixed(1)}s - ${clip.end_time.toFixed(1)}s`);
    await cutClip(inputPath, clip.start_time, clip.end_time, clipPath);

    await uploadFile(clip.file_path, clipPath, "video/mp4");
    await report("Building highlight reel", 95);
    console.log(`[custom_clip:${clip.id}] Done!`);
  } finally {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  }
}

export async function regenerateHighlightReel(videoId: string) {
  const supabase = getSupabase();
  const tmpDir = join(TMP_ROOT, `reel_${videoId}`);
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });
  try {
    const { data: clips } = await supabase
      .from("clips")
      .select("id, file_path, start_time")
      .eq("video_id", videoId)
      .gt("score", 0)
      .order("start_time", { ascending: true });

    if (!clips || clips.length === 0) {
      console.log(`[reel:${videoId}] No clips to concatenate`);
      return;
    }

    console.log(`[reel:${videoId}] Downloading ${clips.length} clips...`);
    const clipPaths: string[] = [];
    for (let i = 0; i < clips.length; i++) {
      const clipPath = join(tmpDir, `clip_${i}.mp4`);
      await downloadToFile(clips[i].file_path, clipPath);
      clipPaths.push(clipPath);
    }

    const reelPath = join(tmpDir, "highlight_reel.mp4");
    console.log(`[reel:${videoId}] Concatenating ${clips.length} clips...`);
    await concatClips(clipPaths, join(tmpDir, "concat.txt"), reelPath);

    const key = reelKey(videoId);
    await deleteObjects([key]);
    await uploadFile(key, reelPath, "video/mp4");

    await supabase.from("videos").update({ highlight_reel_path: key, reel_stale: false, stage: null, progress: 100 }).eq("id", videoId);
    console.log(`[reel:${videoId}] Highlight reel regenerated with ${clips.length} clips!`);
  } finally {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  }
}

export async function processVideo(videoId: string, source: VideoSource) {
  const supabase = getSupabase();
  const report = progressReporter(videoId);
  const tmpDir = join(TMP_ROOT, videoId);
  // A job killed mid-way (worker restart) leaves files behind: start clean.
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });

  try {
    const inputPath = join(tmpDir, "input.mp4");
    const audioPath = join(tmpDir, "audio.raw");

    // 1. Download the full match (streamed; supports files > 2 GB). Download = 0–35% of the bar.
    console.log(`[${videoId}] Downloading video...`);
    await report("Downloading video", 0);
    await fetchSource(source, inputPath, videoId, (pct) => void report("Downloading video", pct * 0.35));
    console.log(`[${videoId}] Download complete`);

    // 2. Duration
    const { stdout: durationStr } = await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", inputPath]);
    const duration = parseFloat(durationStr.trim());
    console.log(`[${videoId}] Duration: ${duration}s`);

    // 3. Mono 8 kHz PCM with a band-pass to drop wind rumble and hiss
    await report("Analyzing audio", 38);
    console.log(`[${videoId}] Extracting audio (with wind noise filter)...`);
    await exec("ffmpeg", [
      "-i", inputPath,
      "-vn", "-ac", "1", "-ar", "8000",
      "-af", "highpass=f=300,lowpass=f=4000",
      "-f", "s16le", "-acodec", "pcm_s16le",
      audioPath,
    ]);

    // 4. Peaks
    console.log(`[${videoId}] Analyzing audio peaks...`);
    const allPeaks = analyzeAudio(audioPath);
    if (!hasUsefulAudio(allPeaks)) {
      await supabase.from("videos").update({ status: "error", duration, error_message: "no_audio" }).eq("id", videoId);
      console.log(`[${videoId}] No useful audio detected, marking error/no_audio`);
      return;
    }
    const topPeaks = findTopPeaks(allPeaks);
    console.log(`[${videoId}] Found ${topPeaks.length} peaks`);
    if (topPeaks.length === 0) {
      await supabase.from("videos").update({ status: "error", duration, error_message: "no_peaks" }).eq("id", videoId);
      console.log(`[${videoId}] No peaks found, marking error/no_peaks`);
      return;
    }

    // 5-7. Cut, upload and record each clip
    const clipPaths: string[] = [];
    for (let i = 0; i < topPeaks.length; i++) {
      const peak = topPeaks[i];
      const start = Math.max(0, peak.second - CLIP_BEFORE_SECONDS);
      const end = Math.min(duration, peak.second + CLIP_AFTER_SECONDS);
      const clipPath = join(tmpDir, `clip_${i}.mp4`);
      await report(`Cutting clip ${i + 1} of ${topPeaks.length}`, 45 + (i / topPeaks.length) * 45);
      console.log(`[${videoId}] Cutting clip ${i + 1}/${topPeaks.length} (${start.toFixed(1)}s - ${end.toFixed(1)}s)`);
      await cutClip(inputPath, start, end, clipPath);

      const key = autoClipKey(videoId, i);
      await uploadFile(key, clipPath, "video/mp4");
      const { error: insertError } = await supabase
        .from("clips")
        .insert({ video_id: videoId, start_time: start, end_time: end, score: peak.score, file_path: key });
      if (insertError) throw new Error(`Clip insert failed: ${insertError.message}`);
      clipPaths.push(clipPath);
      console.log(`[${videoId}] Clip ${i + 1} uploaded`);
    }

    // 8. Reel (clips are already chronological)
    await report("Building highlight reel", 92);
    console.log(`[${videoId}] Generating highlight reel...`);
    const reelPath = join(tmpDir, "highlight_reel.mp4");
    await concatClips(clipPaths, join(tmpDir, "concat.txt"), reelPath);
    const reel = reelKey(videoId);
    await uploadFile(reel, reelPath, "video/mp4");
    console.log(`[${videoId}] Highlight reel uploaded`);

    // 9. Done
    await supabase.from("videos").update({ status: "done", duration, highlight_reel_path: reel, stage: null, progress: 100 }).eq("id", videoId);
    console.log(`[${videoId}] Processing complete!`);

    // 10. Free the R2 free tier: drop the full match now that clips + reel exist
    if (deleteSourceEnabled() && !source.source_url) {
      await deleteObjects([source.file_path]);
      await supabase.from("videos").update({ source_deleted_at: new Date().toISOString() }).eq("id", videoId);
      console.log(`[${videoId}] Source video deleted from R2`);
    }
  } finally {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  }
}
