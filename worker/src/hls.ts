// Full-match streaming copy: one ffmpeg run turns the master into two HLS
// renditions (1080p / 720p), each a single byte-range-indexed .ts file plus its
// playlist, and a master playlist. Uploaded under `{videoId}/hls/` (see hlsKeys).
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { HLS_RENDITIONS, hlsKeys, hlsPrefix } from "../../src/lib/r2/keys";
import { downloadToFile, uploadFile } from "./storage";

const TMP_ROOT = join("/tmp", "peakclip");
const SEGMENT_SECONDS = 6;
/** Per rendition: height cap, video max bitrate, audio bitrate. Order matches HLS_RENDITIONS. */
const LADDER = [
  { height: 1080, video: "6000k", bufsize: "12000k", audio: "128k" },
  { height: 720, video: "3000k", bufsize: "6000k", audio: "96k" },
];

export type HlsOptions = { encoder: string };

export function videoEncoder(): string {
  return process.env.HLS_VIDEO_ENCODER || "libx264";
}

/** ffmpeg arguments (without the binary). `outDir` must contain one folder per rendition. */
export function hlsArgs(inputPath: string, outDir: string, { encoder }: HlsOptions): string[] {
  const split = `[0:v]split=${LADDER.length}${LADDER.map((_, i) => `[v${i}]`).join("")}`;
  const scales = LADDER.map((r, i) => `[v${i}]scale=-2:'min(${r.height},ih)'[o${i}]`);
  const args = ["-nostdin", "-y", "-i", inputPath, "-filter_complex", [split, ...scales].join(";")];
  LADDER.forEach((_, i) => args.push("-map", `[o${i}]`, "-map", "0:a:0"));
  LADDER.forEach((r, i) => {
    args.push(`-c:v:${i}`, encoder, `-b:v:${i}`, r.video, `-maxrate:v:${i}`, r.video, `-bufsize:v:${i}`, r.bufsize);
    args.push(`-c:a:${i}`, "aac", `-b:a:${i}`, r.audio);
  });
  args.push("-pix_fmt", "yuv420p", "-ac", "2", "-force_key_frames", `expr:gte(t,n_forced*${SEGMENT_SECONDS})`);
  if (encoder === "libx264") args.push("-preset:v", "veryfast", "-sc_threshold", "0");
  args.push(
    "-f", "hls",
    "-hls_time", String(SEGMENT_SECONDS),
    "-hls_playlist_type", "vod",
    "-hls_flags", "single_file",
    "-hls_segment_filename", join(outDir, "%v", "index.ts"),
    "-master_pl_name", "master.m3u8",
    "-var_stream_map", LADDER.map((_, i) => `v:${i},a:${i},name:${HLS_RENDITIONS[i]}`).join(" "),
    "-progress", "pipe:1",
    "-loglevel", "error",
    join(outDir, "%v", "index.m3u8"),
  );
  return args;
}

/** Percentage (0–100) from one `-progress` line, or null for lines that carry no time. */
export function parseProgress(line: string, durationSec: number): number | null {
  const m = line.match(/^out_time_(?:us|ms)=(\d+)/);
  if (!m || durationSec <= 0) return null;
  return Math.min(100, (Number(m[1]) / 1_000_000 / durationSec) * 100);
}

/** Runs ffmpeg with `args`, mapping `-progress` output to `onPct` (0–100). Rejects with ffmpeg's stderr. */
export function runFfmpeg(args: string[], durationSec: number, onPct: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args);
    let stderr = "";
    let buffered = "";
    child.stdout.on("data", (buf: Buffer) => {
      buffered += buf.toString();
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      for (const line of lines) {
        const pct = parseProgress(line, durationSec);
        if (pct !== null) onPct(pct);
      }
    });
    child.stderr.on("data", (buf: Buffer) => {
      stderr += buf.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}: ${stderr.slice(-800)}`))));
  });
}

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/**
 * Builds and uploads the streaming copy of a video whose master is still in R2.
 * Progress: download 0–10, encode 10–95, upload 95–100 (`stage` on the row).
 */
export async function generateHls(video: { id: string; file_path: string; duration: number | null }) {
  const supabase = getSupabase();
  const tag = `hls:${video.id}`;
  const stage = "Preparing full match for streaming";
  let last = -1;
  const report = async (pct: number) => {
    const rounded = Math.round(pct);
    if (rounded === last) return;
    last = rounded;
    await supabase.from("videos").update({ stage, progress: Math.max(0, Math.min(100, rounded)) }).eq("id", video.id);
  };

  const tmpDir = join(TMP_ROOT, `hls_${video.id}`);
  rmSync(tmpDir, { recursive: true, force: true });
  const outDir = join(tmpDir, "out");
  for (const r of HLS_RENDITIONS) mkdirSync(join(outDir, r), { recursive: true });
  try {
    const inputPath = join(tmpDir, "input.mp4");
    console.log(`[${tag}] Downloading master...`);
    await report(0);
    await downloadToFile(video.file_path, inputPath, (pct) => void report(pct * 0.1));

    console.log(`[${tag}] Encoding ${HLS_RENDITIONS.join(" + ")} with ${videoEncoder()}...`);
    await report(10);
    await runFfmpeg(hlsArgs(inputPath, outDir, { encoder: videoEncoder() }), video.duration ?? 0, (pct) => void report(10 + pct * 0.85));

    const { data: still } = await supabase.from("videos").select("id").eq("id", video.id).maybeSingle();
    if (!still) {
      console.log(`[${tag}] Match was deleted while encoding; discarding`);
      return;
    }
    console.log(`[${tag}] Uploading...`);
    await report(95);
    const keys = hlsKeys(video.id);
    const prefix = hlsPrefix(video.id);
    for (const key of keys) {
      const local = join(outDir, key.slice(prefix.length + 1));
      if (!existsSync(local)) throw new Error(`ffmpeg did not produce ${local}`);
      await uploadFile(key, local, key.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "video/mp2t");
    }
    await supabase.from("videos").update({ hls_path: prefix, stage: null, progress: 100 }).eq("id", video.id);
    console.log(`[${tag}] Full match ready for streaming`);
  } finally {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  }
}
