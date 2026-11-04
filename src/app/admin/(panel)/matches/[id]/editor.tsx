"use client";

// Port of PeakClip apps/web/app/clips/[videoId]/edit/page.tsx without players,
// overlays and AI. Data comes from server actions (no browser Supabase access).
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, MapPin, Pause, Play, Plus, Scissors, SkipBack, SkipForward, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ClipWithPlayer as Clip, Team } from "@/lib/db/types";
import { teams } from "@/lib/teams";
import type { VideoView } from "@/lib/videos/status";
import { assignPlayer, createCustomClip, deleteClip, type MatchState } from "./actions";
import { NameCombobox } from "@/components/name-combobox";
import { YouTubePlayer, type PlayerHandle } from "./youtube-player";

function formatTimeFull(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function parseTime(str: string): number {
  const parts = str.split(":");
  if (parts.length === 2) return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  return parseFloat(str) || 0;
}

/** Shows mm:ss but lets you type freely; applies on blur/Enter. */
function TimeInput({ value, onChange, className }: { value: number; onChange: (seconds: number) => void; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  function apply() {
    const parsed = parseTime(draft);
    if (parsed >= 0) onChange(parsed);
    setEditing(false);
  }
  return (
    <Input
      value={editing ? draft : formatTimeFull(value)}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => {
        setDraft(formatTimeFull(value));
        setEditing(true);
        requestAnimationFrame(() => e.target.select());
      }}
      onBlur={apply}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          apply();
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={className}
    />
  );
}

type Source = { label: string; kind: "video"; url: string; duration: number } | { label: string; kind: "youtube"; youtubeId: string; duration: number };

export function Editor({ state, team }: { state: MatchState; team: Team }) {
  const router = useRouter();
  const video = state.video!;
  const clips = state.clips;
  const clipUrls = state.urls.clips;
  const view: VideoView = state.view;
  const accent = teams[team];

  const sources: Source[] = [];
  if (state.youtubeId) sources.push({ label: "Full match", kind: "youtube", youtubeId: state.youtubeId, duration: video.duration ?? 0 });
  else if (state.urls.source) sources.push({ label: "Full match", kind: "video", url: state.urls.source, duration: video.duration ?? 0 });
  if (state.urls.reel) sources.push({ label: "Highlight reel", kind: "video", url: state.urls.reel, duration: 0 });

  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<PlayerHandle | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(() => Math.min(15, video.duration || 15));
  const [dragging, setDragging] = useState<"start" | "end" | null>(null);
  const [creating, setCreating] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [videoReady, setVideoReady] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [jumpInput, setJumpInput] = useState("");

  const activeSource = sources[sourceIndex] ?? sources[0];
  const videoUrl = activeSource?.kind === "video" ? activeSource.url : "";
  const isYouTube = activeSource?.kind === "youtube";
  const videoDuration = activeSource?.duration || mediaDuration || 0;
  const isFullMatch = activeSource?.label === "Full match";
  const hasPending = clips.some((c) => c.score === 0);

  // Poll while a custom clip is being cut (PeakClip polled every 5 s too).
  useEffect(() => {
    if (!hasPending) return;
    const id = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(id);
  }, [hasPending, router]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    playerRef.current = {
      play: () => void el.play().catch(() => undefined),
      pause: () => el.pause(),
      seek: (t) => {
        el.currentTime = t;
      },
      currentTime: () => el.currentTime,
      duration: () => el.duration || 0,
    };
    const onTimeUpdate = () => setCurrentTime(el.currentTime);
    const onCanPlay = () => setVideoReady(true);
    const onMeta = () => setMediaDuration(el.duration || 0);
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => setBuffering(false);
    const onSeeked = () => setBuffering(false);
    el.addEventListener("timeupdate", onTimeUpdate);
    el.addEventListener("canplay", onCanPlay);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("waiting", onWaiting);
    el.addEventListener("playing", onPlaying);
    el.addEventListener("seeking", onWaiting);
    el.addEventListener("seeked", onSeeked);
    if (el.readyState >= 3) setVideoReady(true);
    return () => {
      el.removeEventListener("timeupdate", onTimeUpdate);
      el.removeEventListener("canplay", onCanPlay);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("waiting", onWaiting);
      el.removeEventListener("playing", onPlaying);
      el.removeEventListener("seeking", onWaiting);
      el.removeEventListener("seeked", onSeeked);
    };
  }, [videoUrl]);

  function switchSource(i: number) {
    playerRef.current = null;
    setSourceIndex(i);
    setTrimStart(0);
    setTrimEnd(Math.min(15, sources[i]?.duration || 15));
    setCurrentTime(0);
    setPlaying(false);
    setZoom(1);
    setVideoReady(false);
    setBuffering(false);
    setMediaDuration(0);
  }

  function togglePlay() {
    const p = playerRef.current;
    if (!p || !videoReady) return;
    if (playing) {
      p.pause();
      setPlaying(false);
    } else {
      p.play();
      setPlaying(true);
    }
  }

  function seekTo(time: number) {
    const p = playerRef.current;
    if (!p) return;
    const clamped = Math.max(0, Math.min(time, videoDuration));
    p.seek(clamped);
    setCurrentTime(clamped);
  }

  function handleTimelineClick(e: React.MouseEvent<HTMLDivElement>) {
    if (dragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    seekTo(((e.clientX - rect.left) / rect.width) * videoDuration / zoom);
  }

  function handleTrimDrag(e: React.MouseEvent | React.TouchEvent, type: "start" | "end") {
    e.preventDefault();
    e.stopPropagation();
    setDragging(type);
    const timeline = timelineRef.current;
    if (!timeline) return;
    const clientX = (ev: MouseEvent | TouchEvent) => ("touches" in ev ? ev.touches[0]?.clientX ?? 0 : ev.clientX);
    const onMove = (ev: MouseEvent | TouchEvent) => {
      const rect = timeline.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (clientX(ev) - rect.left) / rect.width));
      const time = (x * videoDuration) / zoom;
      if (type === "start") setTrimStart(Math.max(0, Math.min(time, trimEnd - 1)));
      else setTrimEnd(Math.min(videoDuration, Math.max(time, trimStart + 1)));
    };
    const onUp = () => {
      setDragging(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove);
    window.addEventListener("touchend", onUp);
  }

  async function handleCreateClip() {
    if (creating) return;
    setCreating(true);
    try {
      await createCustomClip(video.id, trimStart, trimEnd);
      toast.success("Clip created. Processing…");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create clip");
    } finally {
      setCreating(false);
    }
  }

  // Clip times are match times. In the highlight reel the ready clips are
  // concatenated in time order, so a clip starts at the sum of the previous ones.
  const reelOffsets = new Map<string, number>();
  {
    let acc = 0;
    for (const c of clips) {
      if (c.score <= 0) continue;
      reelOffsets.set(c.id, acc);
      acc += c.end_time - c.start_time;
    }
  }

  /** [start, end] of a clip in the active source's time base, or null if it is not in that source. */
  function clipRange(clip: Clip): [number, number] | null {
    if (isFullMatch) return [clip.start_time, clip.end_time];
    const offset = reelOffsets.get(clip.id);
    if (offset === undefined) return null;
    return [offset, offset + (clip.end_time - clip.start_time)];
  }

  function jumpToClip(clip: Clip) {
    const range = clipRange(clip);
    if (!range) return;
    setTrimStart(range[0]);
    setTrimEnd(range[1]);
    seekTo(range[0]);
  }

  async function handlePlayer(clip: Clip, name: string) {
    try {
      await assignPlayer(clip.id, name || null);
      toast.success(name ? `Player set: ${name}` : "Player cleared");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the player");
    }
  }

  async function handleDeleteClip(clip: Clip) {
    try {
      await deleteClip(clip.id);
      toast.success("Clip deleted. The highlight reel will be rebuilt.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete clip");
    }
  }

  const clipsPanel = (
    <>
    {clips.length > 0 ? (
      <div className="shrink-0 border-t bg-white md:w-80 md:border-l md:border-t-0">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Clips</h3>
          <p className="text-xs text-neutral-500">{clips.length} moments</p>
        </div>
        <div className="flex gap-3 overflow-x-auto px-4 py-3 md:max-h-[560px] md:flex-col md:overflow-y-auto">
          {clips.map((clip, i) => {
            const url = clipUrls[clip.id];
            const range = clipRange(clip);
            const current = !!range && currentTime >= range[0] && currentTime <= range[1];
            return (
              <div
                key={clip.id}
                className={`group relative w-36 shrink-0 cursor-pointer overflow-hidden rounded-lg border transition md:flex md:w-auto md:gap-3 md:p-2 ${current ? `${team === "girls" ? "border-girls" : "border-boys"} ring-2 ring-neutral-200` : "border-neutral-200"}`}
                onClick={() => jumpToClip(clip)}
              >
                <div className="relative aspect-video bg-neutral-900 md:w-28 md:shrink-0 md:rounded-md">
                  {url ? (
                    <video src={url} className="size-full object-cover" muted preload="metadata" />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-neutral-800">
                      <Loader2 className="size-4 animate-spin text-white/70" />
                      <span className="text-[9px] text-neutral-300">{clip.score < 0 ? "Failed" : "Processing…"}</span>
                    </div>
                  )}
                  <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[10px] text-white">{formatTimeFull(clip.start_time)}</span>
                </div>
                <div className="flex min-w-0 flex-1 items-start justify-between px-2 py-1.5 md:px-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium md:text-sm">{i === 0 ? "Best moment" : `Moment #${i + 1}`}</p>
                    <p className="text-[10px] text-neutral-500 md:text-xs">
                      {formatTimeFull(clip.start_time)} – {formatTimeFull(clip.end_time)}
                    </p>
                    <div className="mt-1.5 hidden md:block" onClick={(e) => e.stopPropagation()}>
                      <NameCombobox
                        value={clip.player_name ?? ""}
                        onChange={(name) => void handlePlayer(clip, name)}
                        options={state.players}
                        placeholder="Player (optional)"
                        searchPlaceholder="Search players…"
                        emptyLabel="No players saved yet. Type a name to add one."
                        clearLabel="No player"
                        size="sm"
                        className="h-7 text-xs"
                      />
                    </div>
                    {clip.player_name ? <p className="mt-1 text-[10px] font-medium text-neutral-700 md:hidden">{clip.player_name}</p> : null}
                  </div>
                  <button
                    type="button"
                    aria-label="Delete clip"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDeleteClip(clip);
                    }}
                    className="shrink-0 rounded p-1 text-neutral-400 transition hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    ) : null}
    </>
  );
  if (sources.length === 0) {
    // No playable source right now (e.g. the reel is being rebuilt after a clip was deleted
    // and the full match was already removed): keep the clip list usable.
    return (
      <div className="flex flex-col overflow-hidden rounded-xl border bg-white">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Loader2 className="size-4 animate-spin text-neutral-500" aria-hidden="true" />
          <span className="text-sm text-neutral-600">The highlight reel is being rebuilt. You can still rename or delete clips.</span>
        </div>
        {clipsPanel}
      </div>
    );
  }

  const trimDuration = trimEnd - trimStart;
  const pct = (t: number) => (videoDuration ? (t / videoDuration) * 100 * zoom : 0);
  const cutDisabled = creating || trimDuration < 1 || !view.canCut || !isFullMatch;
  const cutTitle = !view.canCut ? "The full match was removed after processing, so new clips can't be cut." : undefined;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border bg-white">
      {/* Top bar */}
      <div className="flex items-center gap-2 overflow-x-auto border-b px-3 py-2">
        <span className="shrink-0 text-sm font-semibold">Clip editor</span>
        {sources.length > 1 ? (
          <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-neutral-100 p-0.5">
            {sources.map((src, i) => (
              <button
                key={src.label}
                type="button"
                onClick={() => switchSource(i)}
                className={`whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium transition ${i === sourceIndex ? `${accent.bg} text-white` : "text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900"}`}
              >
                {src.label}
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex-1" />
        <Badge className={`${accent.bg} shrink-0 text-[11px] text-white`}>
          {formatTimeFull(trimStart)} – {formatTimeFull(trimEnd)} ({trimDuration.toFixed(0)}s)
        </Badge>
      </div>

      <div className="flex min-h-0 flex-col md:flex-row">
        {/* Video + controls */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-black">
            {isYouTube && activeSource.kind === "youtube" ? (
              <YouTubePlayer
                videoId={activeSource.youtubeId}
                onReady={(handle, duration) => {
                  playerRef.current = handle;
                  setMediaDuration(duration);
                  setVideoReady(true);
                }}
                onState={(st) => {
                  setBuffering(st === "buffering");
                  if (st === "playing") setPlaying(true);
                  if (st === "paused" || st === "ended") setPlaying(false);
                }}
                onTime={setCurrentTime}
                onClick={togglePlay}
              />
            ) : (
              <video ref={videoRef} src={videoUrl} className="max-h-full max-w-full object-contain" onClick={togglePlay} preload="metadata" playsInline />
            )}
            {!videoReady || buffering ? (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/60 text-white">
                <Loader2 className="mb-2 size-8 animate-spin" />
                <p className="text-sm text-white/70">{!videoReady ? "Loading video…" : "Buffering…"}</p>
              </div>
            ) : null}
            {videoReady && !playing && !buffering ? (
              <button type="button" onClick={togglePlay} aria-label="Play" className="absolute inset-0 flex items-center justify-center">
                <span className="flex size-16 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm transition hover:bg-white/20">
                  <Play className="ml-1 size-7 text-white" />
                </span>
              </button>
            ) : null}
          </div>

          <div className={`border-t ${!videoReady ? "pointer-events-none opacity-50" : ""}`}>
            <div className="flex items-center justify-center gap-1 py-2 sm:gap-2">
              <Button variant="ghost" size="icon-sm" aria-label="Back 5 seconds" onClick={() => seekTo(currentTime - 5)}>
                <SkipBack className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label={playing ? "Pause" : "Play"} onClick={togglePlay}>
                {playing ? <Pause className="size-5" /> : <Play className="ml-0.5 size-5" />}
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Forward 5 seconds" onClick={() => seekTo(currentTime + 5)}>
                <SkipForward className="size-4" />
              </Button>
              <span className="ml-3 font-mono text-xs text-neutral-500 sm:text-sm">
                {formatTimeFull(currentTime)} / {formatTimeFull(videoDuration)}
              </span>
              <div className="ml-4 flex items-center gap-1">
                <Button variant="ghost" size="icon-xs" aria-label="Zoom out" onClick={() => setZoom(Math.max(1, zoom - 0.5))}>
                  <ZoomOut className="size-3" />
                </Button>
                <span className="w-8 text-center text-xs text-neutral-500">{zoom}x</span>
                <Button variant="ghost" size="icon-xs" aria-label="Zoom in" onClick={() => setZoom(Math.min(5, zoom + 0.5))}>
                  <ZoomIn className="size-3" />
                </Button>
              </div>
            </div>

            {/* Timeline */}
            <div className="px-2 pb-2 sm:px-4">
              <div ref={timelineRef} className="relative h-24 cursor-crosshair touch-none select-none overflow-hidden rounded-xl bg-neutral-100 sm:h-16" onClick={handleTimelineClick}>
                {Array.from({ length: Math.ceil(videoDuration / 60) + 1 }, (_, i) => {
                  const left = pct(i * 60);
                  if (left > 100) return null;
                  const major = i % 5 === 0;
                  return (
                    <div key={i} className={`absolute top-0 h-full border-l ${major ? "border-neutral-300" : "hidden border-neutral-200 sm:block"}`} style={{ left: `${left}%` }}>
                      <span className="absolute left-1 top-1 text-[9px] font-medium text-neutral-400">{i}m</span>
                    </div>
                  );
                })}
                {clips.map((clip, i) => {
                  const range = clipRange(clip);
                  if (!range) return null;
                  return (
                    <div
                      key={clip.id}
                      className="absolute top-1 h-4 cursor-pointer rounded-sm border border-emerald-500/50 bg-emerald-500/30 transition hover:bg-emerald-500/50 sm:h-3"
                      style={{ left: `${pct(range[0])}%`, width: `${Math.max(pct(range[1]) - pct(range[0]), 1.5)}%` }}
                      onClick={(e) => {
                        e.stopPropagation();
                        jumpToClip(clip);
                      }}
                      title={`Moment #${i + 1}`}
                    >
                      <span className="block truncate px-0.5 text-[8px] text-emerald-700">#{i + 1}</span>
                    </div>
                  );
                })}
                <div className={`absolute bottom-1 top-6 border-y-2 sm:top-5 ${team === "girls" ? "border-girls bg-girls/20" : "border-boys bg-boys/20"}`} style={{ left: `${pct(trimStart)}%`, width: `${pct(trimEnd) - pct(trimStart)}%` }} />
                <div
                  className={`${accent.bg} absolute bottom-1 top-6 z-20 flex w-5 cursor-col-resize items-center justify-center rounded-l sm:top-5 sm:w-3`}
                  style={{ left: `calc(${pct(trimStart)}% - 10px)` }}
                  onMouseDown={(e) => handleTrimDrag(e, "start")}
                  onTouchStart={(e) => handleTrimDrag(e, "start")}
                >
                  <ChevronRight className="size-3 text-white" />
                </div>
                <div
                  className={`${accent.bg} absolute bottom-1 top-6 z-20 flex w-5 cursor-col-resize items-center justify-center rounded-r sm:top-5 sm:w-3`}
                  style={{ left: `calc(${pct(trimEnd)}% - 2px)` }}
                  onMouseDown={(e) => handleTrimDrag(e, "end")}
                  onTouchStart={(e) => handleTrimDrag(e, "end")}
                >
                  <ChevronLeft className="size-3 text-white" />
                </div>
                <div className="pointer-events-none absolute bottom-0 top-0 z-30 w-0.5 bg-red-500" style={{ left: `${pct(currentTime)}%` }}>
                  <div className="-ml-[5px] -mt-0.5 size-3 rounded-full bg-red-500" />
                </div>
              </div>
            </div>

            {/* Trim inputs + actions */}
            <div className="space-y-2 border-t px-4 pb-3 pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <form
                  className="flex items-center gap-1.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const time = parseTime(jumpInput);
                    if (time > 0 && time <= videoDuration) {
                      seekTo(time);
                      setTrimStart(Math.max(0, time - 5));
                      setTrimEnd(Math.min(videoDuration, time + 10));
                      setJumpInput("");
                    }
                  }}
                >
                  <Input value={jumpInput} onChange={(e) => setJumpInput(e.target.value)} placeholder="34:07" aria-label="Jump to time" className="h-8 w-16 text-center font-mono text-sm" />
                  <Button type="submit" variant="outline" size="sm">
                    <MapPin className="mr-1 size-3" /> Go
                  </Button>
                </form>
                <div className="hidden h-6 w-px bg-border sm:block" />
                <label className="flex items-center gap-2 text-xs text-neutral-500">
                  Start <TimeInput value={trimStart} onChange={setTrimStart} className="h-8 w-16 text-center font-mono text-sm" />
                </label>
                <label className="flex items-center gap-2 text-xs text-neutral-500">
                  End <TimeInput value={trimEnd} onChange={setTrimEnd} className="h-8 w-16 text-center font-mono text-sm" />
                </label>
                <span className="text-xs text-neutral-500">{trimDuration.toFixed(0)}s</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTrimStart(Math.max(0, currentTime - 5));
                    setTrimEnd(Math.min(videoDuration, currentTime + 10));
                  }}
                >
                  <Scissors className="mr-1.5 size-3" />
                  <span className="hidden sm:inline">Set around playhead</span>
                  <span className="sm:hidden">Playhead</span>
                </Button>
                <div className="flex-1" />
                <Button onClick={handleCreateClip} disabled={cutDisabled} title={cutTitle} className={`${accent.bg} text-white hover:opacity-90`}>
                  {creating ? (
                    <>
                      <Loader2 className="mr-1.5 size-4 animate-spin" /> Creating clip…
                    </>
                  ) : (
                    <>
                      <Plus className="mr-1.5 size-4" /> Create clip ({trimDuration.toFixed(0)}s)
                    </>
                  )}
                </Button>
              </div>
              {!view.canCut ? <p className="text-xs text-neutral-500">{cutTitle}</p> : null}
            </div>
          </div>
        </div>

        {clipsPanel}
      </div>
    </div>
  );
}
