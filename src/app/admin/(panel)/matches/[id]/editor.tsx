"use client";

// Port of PeakClip apps/web/app/clips/[videoId]/edit/page.tsx without players,
// overlays and AI. Data comes from server actions (no browser Supabase access).
// Presentation follows design/comets-admin-editor.claude-design.html (4a–4k).
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Flag, Loader2, Pause, Play, SkipBack, SkipForward, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { ClipWithPlayer as Clip, Team } from "@/lib/db/types";
import { MARK_AFTER_SECONDS, MARK_BEFORE_SECONDS, planClipsFromMarks } from "@/lib/videos/marks";
import type { VideoView } from "@/lib/videos/status";
import { assignPlayer, createCustomClip, deleteClip, type MatchState } from "./actions";
import { addMark as saveMark, clearMarks, removeMark as dropMark } from "./marks-actions";
import { NameCombobox } from "@/components/name-combobox";
import { useHls } from "@/components/hls-video";
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

const ZOOM_STEPS = [1, 2, 4, 8];

/** Mono time field (76 px) of the design; light and dark variants. */
function fieldClass(dark: boolean) {
  return `h-11 w-full min-w-0 rounded-lg border px-2.5 font-mono text-[15px] font-semibold outline-none sm:h-10 sm:w-[76px] sm:text-sm ${
    dark ? "border-[#3a4560] bg-[#121a2e] text-white focus:border-white" : "border-[#d5d9e2] bg-white text-[#0e0e12] focus:border-boys"
  }`;
}

/** Shows mm:ss but lets you type freely; applies on blur/Enter. */
function TimeInput({ value, onChange, className, ariaLabel }: { value: number; onChange: (seconds: number) => void; className: string; ariaLabel: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  function apply() {
    const parsed = parseTime(draft);
    if (parsed >= 0) onChange(parsed);
    setEditing(false);
  }
  return (
    <input
      aria-label={ariaLabel}
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

/** Assigns clip markers to up to four rows so their times never overlap (design 4k). */
function laneFor(positions: number[], thresholdPct: number): { lanes: number[]; count: number } {
  const last = [-999, -999, -999, -999];
  let max = 0;
  const lanes = positions.map((p) => {
    let lane = last.findIndex((l) => p - l >= thresholdPct);
    if (lane < 0) lane = last.indexOf(Math.min(...last));
    last[lane] = p;
    max = Math.max(max, lane);
    return lane;
  });
  return { lanes, count: max + 1 };
}

type Source = { label: string; kind: "video"; url: string; duration: number } | { label: string; kind: "youtube"; youtubeId: string; duration: number };

export function Editor({ state, team, title }: { state: MatchState; team: Team; title: string }) {
  const router = useRouter();
  const video = state.video!;
  const clips = state.clips;
  const clipUrls = state.urls.clips;
  const view: VideoView = state.view;
  void team;

  const sources: Source[] = [];
  if (state.youtubeId) sources.push({ label: "Full match", kind: "youtube", youtubeId: state.youtubeId, duration: video.duration ?? 0 });
  else if (state.urls.source) sources.push({ label: "Full match", kind: "video", url: state.urls.source, duration: video.duration ?? 0 });
  const reelLength = clips.filter((c) => c.score > 0).reduce((sum, c) => sum + (c.end_time - c.start_time), 0);
  if (state.urls.reel) sources.push({ label: "Highlight reel", kind: "video", url: state.urls.reel, duration: reelLength });

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
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [maximized, setMaximized] = useState(false);
  /** Clip picked from the list or the timeline; highlighting follows this, not the playhead. */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Last clip the reel playhead was followed into (so the selection moves once per clip, not every tick). */
  const [followedId, setFollowedId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** Target of a seek in flight: the player keeps reporting the old time for a moment, which must not move the highlight. */
  const seekRef = useRef<{ time: number; at: number } | null>(null);
  function reportTime(t: number) {
    const seek = seekRef.current;
    if (seek) {
      if (Math.abs(t - seek.time) > 1.5 && Date.now() - seek.at < 2000) return;
      seekRef.current = null;
    }
    setCurrentTime(t);
  }
  // "Mark while watching": match-time marks, saved per video on the server (shared by every
  // coach and device) until clips are cut from them. Shown optimistically, re-synced on refresh.
  const [marks, setMarks] = useState<number[]>(state.marks);
  const [serverMarks, setServerMarks] = useState(state.marks);
  if (state.marks !== serverMarks) {
    setServerMarks(state.marks);
    setMarks(state.marks);
  }
  const [creatingMarks, setCreatingMarks] = useState(false);
  useEffect(() => {
    // Marks made before they were stored on the server lived in this browser: move them over once.
    const key = `comets:marks:${video.id}`;
    let saved: number[] = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(key) ?? "[]");
      if (Array.isArray(parsed) && parsed.every((n) => typeof n === "number")) saved = parsed;
    } catch {
      // ignore a corrupt entry
    }
    if (saved.length === 0) return;
    let cancelled = false;
    (async () => {
      let latest: number[] | null = null;
      for (const t of saved) {
        try {
          latest = await saveMark(video.id, t);
        } catch {
          return; // keep the local copy; we'll try again next time
        }
      }
      localStorage.removeItem(key);
      if (!cancelled && latest) {
        setMarks(latest);
        toast.info(`${saved.length} mark${saved.length === 1 ? "" : "s"} from this browser saved to the match.`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [video.id]);
  // Entering/leaving fullscreen re-creates the player; remember where we were to resume there.
  const [resume, setResume] = useState<{ time: number; playing: boolean } | null>(null);
  function setMax(next: boolean) {
    setResume({ time: playerRef.current?.currentTime() ?? currentTime, playing });
    playerRef.current?.pause();
    playerRef.current = null;
    setVideoReady(false);
    setPlaying(false);
    setMaximized(next);
  }
  // The "Buffering…" overlay only shows when a stall lasts; a quick seek must not flash it.
  const bufferTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopBuffering = () => {
    if (bufferTimer.current) clearTimeout(bufferTimer.current);
    bufferTimer.current = null;
    setBuffering(false);
  };
  const startBuffering = () => {
    if (bufferTimer.current) return;
    bufferTimer.current = setTimeout(() => {
      bufferTimer.current = null;
      setBuffering(true);
    }, 600);
  };

  // Fullscreen editor: Esc leaves it, and the body does not scroll behind it.
  useEffect(() => {
    if (!maximized) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMax(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maximized]);

  const activeSource = sources[sourceIndex] ?? sources[0];
  const videoUrl = activeSource?.kind === "video" ? activeSource.url : "";
  // The full match streams as HLS (hls.js where needed); clips and reels are plain files.
  // The element is re-created when fullscreen toggles, so the source must be re-attached then.
  useHls(videoRef, videoUrl, maximized);
  const isYouTube = activeSource?.kind === "youtube";
  const videoDuration = activeSource?.duration || mediaDuration || 0;
  const isFullMatch = activeSource?.label === "Full match";
  const hasPending = clips.some((c) => c.score === 0);
  const reelUpdating = hasPending || video.reel_stale;

  // Poll while a custom clip is being cut or the reel is being rebuilt (PeakClip polled every 5 s too).
  useEffect(() => {
    if (!reelUpdating) return;
    const id = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(id);
  }, [reelUpdating, router]);

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
    const handle = playerRef.current;
    const onTimeUpdate = () => reportTime(el.currentTime);
    const onCanPlay = () => setVideoReady(true);
    const onMeta = () => {
      setMediaDuration(el.duration || 0);
      if (resume) {
        setResume(null);
        handle.seek(resume.time);
        setCurrentTime(resume.time);
        if (resume.playing) {
          handle.play();
          setPlaying(true);
        }
      }
    };
    const onWaiting = () => startBuffering();
    const onPlaying = () => stopBuffering();
    const onSeeked = () => stopBuffering();
    // Keep the play/pause state in sync when playback starts from somewhere other than the
    // play button (a clip click, the video's own controls, the end of the file).
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onPause);
    el.addEventListener("timeupdate", onTimeUpdate);
    el.addEventListener("canplay", onCanPlay);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("waiting", onWaiting);
    el.addEventListener("playing", onPlaying);
    el.addEventListener("seeking", onWaiting);
    el.addEventListener("seeked", onSeeked);
    if (el.readyState >= 3) setVideoReady(true);
    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onPause);
      el.removeEventListener("timeupdate", onTimeUpdate);
      el.removeEventListener("canplay", onCanPlay);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("waiting", onWaiting);
      el.removeEventListener("playing", onPlaying);
      el.removeEventListener("seeking", onWaiting);
      el.removeEventListener("seeked", onSeeked);
      stopBuffering();
    };
  }, [videoUrl, maximized, resume]);

  function switchSource(i: number) {
    if (i === sourceIndex) return;
    playerRef.current = null;
    setSourceIndex(i);
    setSelectedId(null);
    setFollowedId(null);
    setResume(null);
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
    seekRef.current = { time: clamped, at: Date.now() };
    p.seek(clamped);
    setCurrentTime(clamped);
  }

  // Keyboard: Space plays/pauses, ← / → move 5 s. Ignored while typing in a field or
  // when a button/picker has focus (its own key handling wins).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, select, button, [contenteditable], [role=dialog], [role=listbox], [role=combobox]"))) return;
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        seekTo(currentTime - 5);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        seekTo(currentTime + 5);
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        addMark();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function timeAtClientX(clientX: number): number {
    const el = timelineRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return x * videoDuration;
  }

  /** Moves the selection to 5 s before / 10 s after `time` (what "Set around playhead" does). */
  function selectAround(time: number) {
    setSelectedId(null);
    setTrimStart(Math.max(0, time - 5));
    setTrimEnd(Math.min(videoDuration, time + 10));
  }

  function addMark() {
    if (!isFullMatch || !view.canCut) return;
    const t = Math.round((playerRef.current?.currentTime() ?? currentTime) * 10) / 10;
    if (marks.some((m) => Math.abs(m - t) < 1)) return;
    const before = marks;
    setMarks([...marks, t].sort((a, b) => a - b));
    toast.success(`Marked ${formatTimeFull(t)}`, { duration: 1200 });
    saveMark(video.id, t).then(setMarks, (err) => {
      setMarks(before);
      toast.error(err instanceof Error ? err.message : "Failed to save mark");
    });
  }
  function removeMark(t: number) {
    const before = marks;
    setMarks(marks.filter((m) => m !== t));
    dropMark(video.id, t).then(setMarks, (err) => {
      setMarks(before);
      toast.error(err instanceof Error ? err.message : "Failed to remove mark");
    });
  }
  function handleClearMarks() {
    const before = marks;
    setMarks([]);
    clearMarks(video.id).catch((err) => {
      setMarks(before);
      toast.error(err instanceof Error ? err.message : "Failed to clear marks");
    });
  }

  /** Clicking the track seeks; outside the current selection it also moves the selection there. */
  function handleTimelineClick(e: React.MouseEvent<HTMLDivElement>) {
    if (dragging) return;
    const time = timeAtClientX(e.clientX);
    seekTo(time);
    if (time < trimStart || time > trimEnd) selectAround(time);
  }

  function handleTrimDrag(e: React.MouseEvent | React.TouchEvent, type: "start" | "end") {
    e.preventDefault();
    e.stopPropagation();
    setDragging(type);
    const clientX = (ev: MouseEvent | TouchEvent) => ("touches" in ev ? ev.touches[0]?.clientX ?? 0 : ev.clientX);
    const onMove = (ev: MouseEvent | TouchEvent) => {
      const time = timeAtClientX(clientX(ev));
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
    setSelectedId(clip.id);
    setTrimStart(range[0]);
    setTrimEnd(range[1]);
    seekTo(range[0]);
    // Picking a clip is "show me this": start playing it right away.
    playerRef.current?.play();
  }

  // The clip under the playhead is the highlighted one; a clicked clip stays highlighted
  // while the playhead is outside every clip (full match).
  const playheadClip = clips.find((c) => {
    const r = clipRange(c);
    return !!r && currentTime >= r[0] && currentTime < r[1];
  });
  const activeId = playheadClip?.id ?? selectedId;
  if (!isFullMatch && playheadClip && playheadClip.id !== followedId) {
    // Reel: the selection block follows the playhead from clip to clip.
    const range = clipRange(playheadClip)!;
    setFollowedId(playheadClip.id);
    setSelectedId(playheadClip.id);
    setTrimStart(range[0]);
    setTrimEnd(range[1]);
  }
  useEffect(() => {
    // Keep the highlighted card in view inside the list (never scrolls the page).
    const list = listRef.current;
    const card = activeId ? list?.querySelector<HTMLElement>(`[data-clip-id="${activeId}"]`) : null;
    if (!list || !card) return;
    const top = card.offsetTop - list.offsetTop;
    const bottom = top + card.offsetHeight;
    if (top < list.scrollTop) list.scrollTo({ top, behavior: "smooth" });
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTo({ top: bottom - list.clientHeight, behavior: "smooth" });
  }, [activeId]);

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
    setDeletingIds((prev) => new Set(prev).add(clip.id));
    try {
      await deleteClip(clip.id);
      toast.success(`${clipName(clip)} deleted. The highlight reel is being updated.`);
      router.refresh();
    } catch (err) {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(clip.id);
        return next;
      });
      toast.error(err instanceof Error ? err.message : "Failed to delete clip");
    }
  }

  const isCustom = (clip: Clip) => clip.file_path.includes("/custom_");
  // Named by their start time, not their position: deleting a clip must not rename the ones below it.
  const clipKind = (clip: Clip) => (clip.score === 0 ? "New clip" : clip.score < 0 ? "Failed clip" : isCustom(clip) ? "Custom clip" : "Moment");
  const clipName = (clip: Clip) => `${clipKind(clip)} · ${formatTimeFull(clip.start_time)}`;

  const markPlan = planClipsFromMarks(marks, video.duration ?? 0, clips.map((c) => ({ start: c.start_time, end: c.end_time })));

  async function handleCreateFromMarks() {
    if (creatingMarks || markPlan.ranges.length === 0) return;
    setCreatingMarks(true);
    let created = 0;
    let firstError: string | null = null;
    for (const [start, end] of markPlan.ranges) {
      try {
        await createCustomClip(video.id, start, end);
        created++;
      } catch (err) {
        firstError ??= err instanceof Error ? err.message : "Failed to create clip";
      }
    }
    if (created) toast.success(`${created} clip${created === 1 ? "" : "s"} queued. The worker cuts them one by one.`);
    if (markPlan.skipped.length) toast.info(`${markPlan.skipped.length} mark${markPlan.skipped.length === 1 ? "" : "s"} skipped: that clip already exists.`);
    if (firstError) toast.error(firstError);
    try {
      await clearMarks(video.id);
      setMarks([]);
    } catch {
      toast.error("Clips were created but the marks could not be cleared. Use Clear.");
    }
    setCreatingMarks(false);
    router.refresh();
  }

  const dark = maximized;

  const clipsPanel = (
    <aside className={dark ? "flex min-h-0 flex-col border-t border-[#26304a] bg-[#121a2e] md:border-l md:border-t-0" : "flex min-w-0 flex-col gap-3 rounded-xl border border-[#e3e6ec] bg-white p-3 md:rounded-none md:border-0 md:p-0"}>
      <div className={`flex items-baseline justify-between ${dark ? "px-3.5 pb-2.5 pt-4" : ""}`}>
        <h2 className={`font-display tracking-[0.02em] ${dark ? "text-2xl text-white" : "text-[26px] text-[#0e0e12] sm:text-[28px]"}`}>Clips · {clips.length} moments</h2>
        {!dark ? <span className="text-xs font-medium text-[#5b6070]">By time</span> : null}
      </div>
      {reelUpdating && !dark ? (
        <div role="status" className="flex items-start gap-2 rounded-lg border border-[#f5d58a] bg-[#fff4db] px-3 py-2.5 text-[13px] font-medium leading-[1.4] text-[#7a4a00]">
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden="true" />
          <span>Updating highlight reel… the current reel stays live until the new one is ready.</span>
        </div>
      ) : null}
      <div ref={listRef} className={dark ? "relative flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-2.5 pb-3" : "relative flex flex-col gap-2 md:max-h-[860px] md:overflow-y-auto md:pr-1"}>
        {clips.map((clip) => {
          const url = clipUrls[clip.id];
          const active = activeId === clip.id;
          const removing = deletingIds.has(clip.id);
          const cutting = clip.score === 0;
          const editable = !removing && !cutting;
          const thumb = (
            <div className={`relative aspect-video overflow-hidden ${dark ? "rounded bg-[#26304a]" : "rounded-md bg-[#1a2134]"}`}>
              {url ? (
                <video src={url} className="size-full object-cover" muted preload="metadata" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-white">
                  <Loader2 className={`animate-spin ${dark ? "size-3.5" : "size-[18px]"}`} aria-hidden="true" />
                </div>
              )}
              <span className={`absolute bottom-1 right-1 rounded bg-black/75 font-mono font-semibold text-white ${dark ? "px-1 text-[10px]" : "px-[5px] py-px text-[11px]"}`}>
                {formatTimeFull(clip.start_time)}
              </span>
            </div>
          );
          if (dark) {
            return (
              <div
                key={clip.id}
                data-clip-id={clip.id}
                role="button"
                tabIndex={0}
                onClick={() => jumpToClip(clip)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") jumpToClip(clip);
                }}
                className={`grid cursor-pointer grid-cols-[80px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg border p-1.5 text-left ${
                  removing ? "pointer-events-none border-[#5a2a2a]" : active ? "border-white" : "border-[#26304a] hover:border-[#3a4560]"
                }`}
              >
                {thumb}
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[13px] font-semibold text-white">{clipName(clip)}</span>
                  <span className={`text-xs font-medium ${cutting ? "text-[#f5c76a]" : removing ? "text-[#ff9b90]" : "text-[#a9b3cc]"}`}>
                    {cutting ? "Cutting…" : removing ? "Removing" : clip.player_name || `${formatTimeFull(clip.start_time)} – ${formatTimeFull(clip.end_time)}`}
                  </span>
                </span>
                {editable ? (
                  <button
                    type="button"
                    aria-label="Delete clip"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDeleteClip(clip);
                    }}
                    className="flex size-8 shrink-0 items-center justify-center rounded-md text-[#a9b3cc] transition hover:bg-white/10 hover:text-[#ff9b90]"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                ) : (
                  <span className="size-8 shrink-0" />
                )}
              </div>
            );
          }
          return (
            <div
              key={clip.id}
              data-clip-id={clip.id}
              role="button"
              tabIndex={0}
              onClick={() => jumpToClip(clip)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") jumpToClip(clip);
              }}
              className={`grid cursor-pointer grid-cols-[108px_minmax(0,1fr)] gap-2.5 rounded-[10px] border p-2 transition sm:grid-cols-[112px_minmax(0,1fr)] ${
                removing
                  ? "pointer-events-none border-[#f6c9c5] bg-[#fdecec]"
                  : active
                    ? "border-boys bg-[#f5f7fb] shadow-[inset_0_0_0_1px_#0b1f4b]"
                    : "border-[#e3e6ec] bg-white hover:border-[#c3c8d2]"
              }`}
            >
              {thumb}
              <div className="flex min-w-0 flex-col gap-1 sm:gap-1.5">
                <div className="flex items-center justify-between gap-1.5">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-[#0e0e12]">{clipName(clip)}</span>
                  </span>
                  {editable ? (
                    <button
                      type="button"
                      aria-label="Delete clip"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDeleteClip(clip);
                      }}
                      className="-m-1.5 flex size-11 shrink-0 items-center justify-center rounded-md text-[#5b6070] transition hover:bg-[#fdecec] hover:text-[#b42318] sm:m-0 sm:size-8"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
                <span className="font-mono text-xs font-medium text-[#5b6070]">
                  {formatTimeFull(clip.start_time)} – {formatTimeFull(clip.end_time)}
                </span>
                {editable ? (
                  <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                    <NameCombobox
                      value={clip.player_name ?? ""}
                      onChange={(name) => void handlePlayer(clip, name)}
                      options={state.players}
                      placeholder="Add player"
                      searchPlaceholder="Search or add a player"
                      emptyLabel="No players saved yet. Type a name to add one."
                      clearLabel="No player"
                      size="sm"
                      className={`h-11 rounded-md border-[#d5d9e2] text-sm sm:h-8 sm:text-[13px] ${clip.player_name ? "text-[#0e0e12]" : "text-[#5b6070]"}`}
                    />
                  </div>
                ) : null}
                {cutting ? <span className="text-xs font-semibold text-[#7a4a00]">Cutting…</span> : null}
                {removing ? <span className="text-xs font-semibold text-[#b42318]">Removing</span> : null}
                {clip.score < 0 ? <span className="text-xs font-semibold text-[#b42318]">Could not cut this clip</span> : null}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );

  if (sources.length === 0) {
    // No playable source right now (e.g. the reel is being rebuilt after a clip was deleted
    // and the full match was already removed): keep the clip list usable.
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-[#e3e6ec] bg-white p-3 sm:p-5">
        <div className="flex items-center gap-2 text-sm text-[#5b6070]">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          <span>The highlight reel is being rebuilt. You can still rename or delete clips.</span>
        </div>
        {clipsPanel}
      </div>
    );
  }

  const trimDuration = trimEnd - trimStart;
  const pct = (t: number) => (videoDuration ? (t / videoDuration) * 100 : 0);
  const duplicateOf = isFullMatch ? clips.find((c) => Math.abs(c.start_time - trimStart) < 0.5 && Math.abs(c.end_time - trimEnd) < 0.5) : undefined;
  const cutDisabled = creating || trimDuration < 1 || !view.canCut || !isFullMatch || !!duplicateOf;
  const cutTitle = !view.canCut
    ? "The original file was deleted, so new clips can't be cut."
    : !isFullMatch
      ? "Switch to the full match to cut a new clip."
      : duplicateOf
        ? `This range is already "${clipName(duplicateOf)}". Move the selection to cut a new moment.`
        : undefined;
  const selectionLabel = `${formatTimeFull(trimStart)} – ${formatTimeFull(trimEnd)} (${trimDuration.toFixed(0)}s)`;
  // The clip is cut from the selection, not from where the video is paused: say so when they differ.
  const playheadOutside = isFullMatch && videoReady && (currentTime < trimStart - 0.5 || currentTime > trimEnd + 0.5);
  const selectionHint = playheadOutside
    ? `The video is at ${formatTimeFull(currentTime)} but the clip will be cut at ${formatTimeFull(trimStart)} – ${formatTimeFull(trimEnd)}. Use "Set around playhead" to cut here.`
    : null;

  // Timeline model: labels every 5 min (1 min on short sources), minute ticks, markers in lanes.
  const minutes = Math.floor(videoDuration / 60);
  const labelEvery = videoDuration > 1200 ? 5 : 1;
  const ranges = clips.map((c) => ({ clip: c, range: clipRange(c) })).filter((r): r is { clip: Clip; range: [number, number] } => !!r.range);
  // Badges are kept inside the track (clamped near the edges), so lanes are computed from the clamped spots.
  const badgeGapPct = 4.8 / zoom;
  const badgePct = (start: number) => Math.min(100 - badgeGapPct * 0.6, Math.max(badgeGapPct * 0.6, pct(start)));
  const { lanes, count: laneCount } = laneFor(ranges.map((r) => badgePct(r.range[0])), badgeGapPct);

  const ctl = {
    square: `flex size-11 shrink-0 items-center justify-center rounded-lg border sm:size-10 ${dark ? "border-[#3a4560] text-white hover:bg-white/10" : "border-[#d5d9e2] bg-white text-[#0e0e12] hover:bg-[#f4f5f8]"}`,
    outline: `inline-flex h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-lg border px-3.5 text-sm font-semibold transition sm:h-10 ${dark ? "border-[#3a4560] text-white hover:bg-white/10" : "border-[#d5d9e2] bg-white text-[#0e0e12] hover:bg-[#f4f5f8]"}`,
    label: `text-xs font-semibold ${dark ? "text-[#a9b3cc]" : "text-[#5b6070]"}`,
  };

  const sourcePills = (
    <div role="group" aria-label="Video source" className={`grid grid-cols-2 gap-1 rounded-full p-[3px] sm:flex ${dark ? "bg-[#1a2236]" : "bg-[#eef0f4]"}`}>
      {sources.map((src, i) => {
        const on = i === sourceIndex;
        return (
          <button
            key={src.label}
            type="button"
            aria-pressed={on}
            onClick={() => switchSource(i)}
            className={`min-h-10 whitespace-nowrap rounded-full px-3.5 text-sm font-semibold transition sm:min-h-[30px] sm:text-[13px] ${
              on ? (dark ? "bg-white text-boys" : "bg-boys text-white") : dark ? "text-[#dce2ef] hover:bg-white/10" : "text-[#0e0e12] hover:bg-white/70"
            }`}
          >
            {src.label}
          </button>
        );
      })}
    </div>
  );

  const selectionChip = (
    <span className={`whitespace-nowrap rounded-full px-3 py-[5px] font-mono text-xs font-semibold sm:text-[13px] ${dark ? "bg-white text-boys" : "bg-boys text-white"}`}>{selectionLabel}</span>
  );

  const player = (
    <div className={`relative flex items-center justify-center overflow-hidden bg-black ${dark ? "h-full max-w-full rounded-lg" : "-mx-3 aspect-video sm:mx-0 sm:rounded-[10px]"}`} style={dark ? { aspectRatio: "16 / 9" } : undefined}>
      {isYouTube && activeSource.kind === "youtube" ? (
        <YouTubePlayer
          videoId={activeSource.youtubeId}
          startAt={resume?.time}
          autoplay={resume?.playing}
          onStarted={() => {
            if (resume) {
              setCurrentTime(resume.time);
              setPlaying(resume.playing);
              setResume(null);
            }
          }}
          onReady={(handle, duration) => {
            playerRef.current = handle;
            setMediaDuration(duration);
            setVideoReady(true);
          }}
          onState={(st) => {
            if (st === "buffering") startBuffering();
            else stopBuffering();
            if (st === "playing") setPlaying(true);
            if (st === "paused" || st === "ended") setPlaying(false);
          }}
          onTime={reportTime}
          onClick={togglePlay}
        />
      ) : (
        <video ref={videoRef} className="size-full object-contain" onClick={togglePlay} preload="metadata" playsInline />
      )}
      {!dark && videoReady ? (
        <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">{activeSource.label}</span>
      ) : null}
      {!videoReady || buffering ? (
        <div role="status" className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2.5 bg-black/60 text-[13px] font-medium text-white">
          <Loader2 className="size-6 animate-spin" aria-hidden="true" />
          {!videoReady ? "Loading video…" : "Buffering…"}
        </div>
      ) : null}
      {videoReady && !playing && !buffering ? (
        <button type="button" onClick={togglePlay} aria-label="Play" className="absolute inset-0 flex items-center justify-center">
          <span className="flex size-[60px] items-center justify-center rounded-full bg-white text-boys shadow-[0_8px_24px_rgba(0,0,0,0.3)] transition hover:scale-105 sm:size-[72px]">
            <Play className="ml-1 size-6 fill-current sm:size-7" />
          </span>
        </button>
      ) : null}
    </div>
  );

  const controls = (
    <div className={`flex items-center gap-1.5 sm:gap-2 ${!videoReady ? "pointer-events-none opacity-50" : ""}`}>
      <button type="button" aria-label="Back 5 seconds" onClick={() => seekTo(currentTime - 5)} className={ctl.square}>
        <SkipBack className="size-4" />
      </button>
      <button
        type="button"
        aria-label={playing ? "Pause" : "Play"}
        onClick={togglePlay}
        className={`flex size-12 shrink-0 items-center justify-center rounded-full sm:size-11 ${dark ? "bg-white text-boys" : "bg-boys text-white"}`}
      >
        {playing ? <Pause className="size-5 fill-current" /> : <Play className="ml-0.5 size-5 fill-current" />}
      </button>
      <button type="button" aria-label="Forward 5 seconds" onClick={() => seekTo(currentTime + 5)} className={ctl.square}>
        <SkipForward className="size-4" />
      </button>
      <span className={`ml-auto font-mono text-sm font-semibold sm:ml-2 sm:text-[15px] ${dark ? "text-white" : "text-[#0e0e12]"}`}>
        {formatTimeFull(currentTime)} <span className={dark ? "text-[#a9b3cc]" : "text-[#5b6070]"}>/ {formatTimeFull(videoDuration)}</span>
      </span>
      {isFullMatch && view.canCut ? (
        <button
          type="button"
          onClick={addMark}
          title="Mark this moment (M)"
          className={`inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-sm font-semibold transition sm:ml-2 sm:h-10 ${
            dark ? "border-[#f5c76a] text-[#f5c76a] hover:bg-[#f5c76a]/10" : "border-[#f5d58a] bg-[#fff4db] text-[#7a4a00] hover:bg-[#fde9b8]"
          }`}
        >
          <Flag className="size-4" aria-hidden="true" />
          Mark
          <kbd className="hidden rounded border border-current/40 px-1 font-mono text-[10px] sm:inline">M</kbd>
        </button>
      ) : null}
      <div role="group" aria-label="Timeline zoom" className={`hidden items-center overflow-hidden rounded-lg border sm:ml-auto sm:flex ${dark ? "border-[#3a4560]" : "border-[#d5d9e2]"}`}>
        <button type="button" aria-label="Zoom out" onClick={() => setZoom(ZOOM_STEPS[Math.max(0, ZOOM_STEPS.indexOf(zoom) - 1)])} className={`size-9 text-lg font-semibold ${dark ? "text-white hover:bg-white/10" : "bg-white text-[#0e0e12] hover:bg-[#f4f5f8]"}`}>
          −
        </button>
        <span className={`min-w-9 text-center font-mono text-[13px] font-semibold ${dark ? "text-white" : "text-[#0e0e12]"}`}>{zoom}x</span>
        <button type="button" aria-label="Zoom in" onClick={() => setZoom(ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, ZOOM_STEPS.indexOf(zoom) + 1)])} className={`size-9 text-lg font-semibold ${dark ? "text-white hover:bg-white/10" : "bg-white text-[#0e0e12] hover:bg-[#f4f5f8]"}`}>
          +
        </button>
      </div>
    </div>
  );

  const mobileZoomRow = (
    <div className="flex items-center justify-between sm:hidden">
      {selectionChip}
      <div role="group" aria-label="Timeline zoom" className="flex items-center overflow-hidden rounded-lg border border-[#d5d9e2]">
        <button type="button" aria-label="Zoom out" onClick={() => setZoom(ZOOM_STEPS[Math.max(0, ZOOM_STEPS.indexOf(zoom) - 1)])} className="size-11 bg-white text-lg font-semibold text-[#0e0e12]">
          −
        </button>
        <span className="min-w-[30px] text-center font-mono text-[13px] font-semibold">{zoom}x</span>
        <button type="button" aria-label="Zoom in" onClick={() => setZoom(ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, ZOOM_STEPS.indexOf(zoom) + 1)])} className="size-11 bg-white text-lg font-semibold text-[#0e0e12]">
          +
        </button>
      </div>
    </div>
  );

  const timeline = (
    <div className={`overflow-y-hidden pb-3 pt-1 ${zoom > 1 ? "overflow-x-auto" : "overflow-x-hidden"} ${dark ? "" : "-mx-3 sm:mx-0"}`}>
      <div className="relative box-border px-[18px] sm:px-3" style={{ width: `${zoom * 100}%` }}>
        {/* Ruler */}
        <div className="relative h-7">
          {Array.from({ length: minutes + 1 }, (_, m) => {
            const left = `${pct(m * 60)}%`;
            if (m % labelEvery === 0) {
              return (
                <span key={m} className="absolute bottom-0 top-0 flex -translate-x-1/2 flex-col items-center justify-between" style={{ left }}>
                  <span className={`font-mono text-[11px] font-medium ${dark ? "text-[#a9b3cc]" : "text-[#5b6070]"}`}>{m}m</span>
                  <span className="h-3 w-px bg-[#7c8394]" />
                </span>
              );
            }
            return <span key={m} className={`absolute bottom-0 w-px ${dark ? "bg-[#3a4560]" : "bg-[#c3c8d2]"}`} style={{ left, height: m % 5 === 0 ? 9 : 5 }} />;
          })}
        </div>
        {/* Marker lanes */}
        {ranges.length > 0 ? (
          <div className="relative mt-1.5" style={{ height: laneCount * 22 }}>
            {ranges.map((r, idx) => {
              const pendingMarker = r.clip.score === 0;
              const removingMarker = deletingIds.has(r.clip.id);
              const markerTone = removingMarker
                ? dark ? "border-[#7a2a24] bg-[#3a1512] text-[#ff9b90]" : "border-[#f6c9c5] bg-[#fdecec] text-[#b42318]"
                : pendingMarker
                  ? dark ? "border-[#7a5a1a] bg-[#3a2a0c] text-[#f5c76a]" : "border-[#f5d58a] bg-[#fff4db] text-[#7a4a00]"
                  : activeId === r.clip.id
                    ? dark ? "border-white bg-white text-boys" : "border-boys bg-boys text-white"
                    : dark ? "border-[#2f7a4f] bg-[#163a27] text-[#bfebd0]" : "border-[#9fd8b4] bg-[#e3f5ea] text-[#146c3a] hover:bg-[#cdeedb]";
              return (
                <button
                  key={r.clip.id}
                  type="button"
                  title={clipName(r.clip)}
                  onClick={() => jumpToClip(r.clip)}
                  className={`absolute -translate-x-1/2 whitespace-nowrap rounded-full border px-1.5 font-mono text-[11px] font-semibold leading-[18px] ${markerTone}`}
                  style={{ left: `${badgePct(r.range[0])}%`, top: lanes[idx] * 22 }}
                >
                  {formatTimeFull(r.clip.start_time)}
                </button>
              );
            })}
          </div>
        ) : null}
        {/* Track */}
        <div ref={timelineRef} className={`relative mt-1.5 h-[52px] cursor-crosshair touch-none select-none rounded-lg sm:h-12 ${dark ? "bg-[#1a2236]" : "bg-[#eef0f4]"}`} onClick={handleTimelineClick}>
          {ranges.map((r) => (
            <span
              key={r.clip.id}
              className={`absolute bottom-0 top-0 min-w-[3px] ${
                deletingIds.has(r.clip.id) ? "bg-[#f6c9c5]" : r.clip.score === 0 ? "bg-[#f5d58a]" : dark ? "bg-[#2f7a4f]" : "bg-[#9fd8b4]"
              }`}
              style={{ left: `${pct(r.range[0])}%`, width: `${pct(r.range[1]) - pct(r.range[0])}%` }}
            />
          ))}
          {isFullMatch
            ? marks.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-label={`Mark at ${formatTimeFull(m)}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    seekTo(m);
                    selectAround(m);
                  }}
                  className="absolute -top-2 bottom-0 z-10 w-0.5 bg-[#f5a524]"
                  style={{ left: `${pct(m)}%` }}
                >
                  <span className="absolute -top-1 left-1/2 size-2.5 -translate-x-1/2 rotate-45 rounded-[2px] bg-[#f5a524]" />
                </button>
              ))
            : null}
          <div
            className={`absolute -bottom-1 -top-1 border-y-2 ${dark ? "border-white bg-white/25" : "border-boys bg-boys/20"}`}
            style={{ left: `${pct(trimStart)}%`, width: `${Math.max(0, pct(trimEnd) - pct(trimStart))}%` }}
          >
            <span
              role="slider"
              aria-label="Clip start"
              aria-valuenow={Math.round(trimStart)}
              aria-valuemin={0}
              aria-valuemax={Math.round(videoDuration)}
              aria-valuetext={formatTimeFull(trimStart)}
              tabIndex={0}
              onMouseDown={(e) => handleTrimDrag(e, "start")}
              onTouchStart={(e) => handleTrimDrag(e, "start")}
              className={`absolute -bottom-0.5 -top-0.5 right-full flex w-4 cursor-ew-resize items-center justify-center rounded-l-md sm:w-3 ${dark ? "bg-white" : "bg-boys"}`}
            >
              <span className={`h-4 w-0.5 rounded-px ${dark ? "bg-boys" : "bg-white"}`} />
            </span>
            <span
              role="slider"
              aria-label="Clip end"
              aria-valuenow={Math.round(trimEnd)}
              aria-valuemin={0}
              aria-valuemax={Math.round(videoDuration)}
              aria-valuetext={formatTimeFull(trimEnd)}
              tabIndex={0}
              onMouseDown={(e) => handleTrimDrag(e, "end")}
              onTouchStart={(e) => handleTrimDrag(e, "end")}
              className={`absolute -bottom-0.5 -top-0.5 left-full flex w-4 cursor-ew-resize items-center justify-center rounded-r-md sm:w-3 ${dark ? "bg-white" : "bg-boys"}`}
            >
              <span className={`h-4 w-0.5 rounded-px ${dark ? "bg-boys" : "bg-white"}`} />
            </span>
          </div>
          <span className={`pointer-events-none absolute -bottom-2.5 -top-2.5 w-0.5 ${dark ? "bg-[#ff6b5e]" : "bg-[#d92d20]"}`} style={{ left: `${pct(currentTime)}%` }} />
        </div>
      </div>
    </div>
  );

  const marksStrip =
    isFullMatch && marks.length > 0 ? (
      <div className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 ${dark ? "border-[#3a4560] bg-[#121a2e]" : "border-[#f5d58a] bg-[#fff4db]"}`}>
        <span className={`text-xs font-semibold ${dark ? "text-[#f5c76a]" : "text-[#7a4a00]"}`}>
          Marks · {marks.length}
        </span>
        {marks.map((m) => (
          <span key={m} className={`inline-flex items-center overflow-hidden rounded-full border ${dark ? "border-[#3a4560] bg-[#1a2236]" : "border-[#f5d58a] bg-white"}`}>
            <button
              type="button"
              onClick={() => {
                seekTo(m);
                selectAround(m);
              }}
              className={`px-2 py-0.5 font-mono text-xs font-semibold ${dark ? "text-white" : "text-[#0e0e12]"}`}
            >
              {formatTimeFull(m)}
            </button>
            <button type="button" aria-label={`Remove mark at ${formatTimeFull(m)}`} onClick={() => removeMark(m)} className={`flex size-6 items-center justify-center ${dark ? "text-[#a9b3cc] hover:text-white" : "text-[#7a4a00] hover:bg-[#fde9b8]"}`}>
              <X className="size-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        <span className="ml-auto flex items-center gap-2">
          <button type="button" onClick={handleClearMarks} className={`text-xs font-semibold underline ${dark ? "text-[#a9b3cc]" : "text-[#7a4a00]"}`}>
            Clear
          </button>
          <button
            type="button"
            onClick={handleCreateFromMarks}
            disabled={creatingMarks || markPlan.ranges.length === 0}
            title={`${MARK_BEFORE_SECONDS}s before and ${MARK_AFTER_SECONDS}s after each mark`}
            className={`inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
              dark ? "bg-white text-boys hover:bg-[#eef0f4]" : "bg-boys text-white hover:bg-boys-deep"
            }`}
          >
            {creatingMarks ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Create clips from marks ({markPlan.ranges.length})
          </button>
        </span>
      </div>
    ) : null;

  const jumpForm = (
    <form
      className="flex gap-1.5 sm:gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        const time = parseTime(jumpInput);
        if (time > 0 && time <= videoDuration) {
          seekTo(time);
          selectAround(time);
          setJumpInput("");
        }
      }}
    >
      <input value={jumpInput} onChange={(e) => setJumpInput(e.target.value)} placeholder="34:07" aria-label="Jump to time" className={`${fieldClass(dark)} flex-1 sm:flex-none`} />
      <button type="submit" className={ctl.outline}>
        Go
      </button>
    </form>
  );

  const setAroundButton = (
    <button
      type="button"
      onClick={() => selectAround(currentTime)}
      className={`${ctl.outline} ${playheadOutside ? (dark ? "border-white" : "border-boys text-boys") : ""}`}
    >
      Set around playhead
    </button>
  );

  const createButton = (
    <button
      type="button"
      onClick={handleCreateClip}
      disabled={cutDisabled}
      title={cutTitle}
      className={`inline-flex min-h-[52px] items-center justify-center gap-2 whitespace-nowrap rounded-[10px] px-6 text-[15px] font-bold transition sm:ml-auto sm:min-h-12 ${
        cutDisabled
          ? dark
            ? "cursor-not-allowed bg-white/15 text-[#a9b3cc]"
            : "cursor-not-allowed bg-[#e3e6ec] text-[#7c8394]"
          : dark
            ? "bg-white text-boys hover:bg-[#eef0f4]"
            : "bg-boys text-white hover:bg-boys-deep"
      }`}
    >
      {creating ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
      {creating ? "Creating clip…" : `Create clip (${trimDuration.toFixed(0)}s)`}
    </button>
  );

  const trimRow = dark ? (
    <div className="flex flex-wrap items-center gap-2.5">
      {jumpForm}
      <span className="h-7 w-px bg-[#3a4560]" />
      <span className={ctl.label}>Start</span>
      <TimeInput value={trimStart} onChange={setTrimStart} ariaLabel="Start" className={fieldClass(true)} />
      <span className={ctl.label}>End</span>
      <TimeInput value={trimEnd} onChange={setTrimEnd} ariaLabel="End" className={fieldClass(true)} />
      <span className="font-mono text-sm font-semibold text-[#dce2ef]">{trimDuration.toFixed(0)}s</span>
      {setAroundButton}
      {createButton}
    </div>
  ) : (
    <div className="flex flex-col gap-2.5 border-t border-[#e3e6ec] pt-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-3 sm:pt-3.5">
      <label className="flex flex-col gap-1 sm:w-auto">
        <span className={`${ctl.label} hidden sm:block`}>Jump to</span>
        {jumpForm}
      </label>
      <span className="hidden h-10 w-px bg-[#e3e6ec] sm:block" />
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_64px] gap-2 sm:contents">
        <label className="flex min-w-0 flex-col gap-1">
          <span className={ctl.label}>Start</span>
          <TimeInput value={trimStart} onChange={setTrimStart} ariaLabel="Start" className={fieldClass(false)} />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className={ctl.label}>End</span>
          <TimeInput value={trimEnd} onChange={setTrimEnd} ariaLabel="End" className={fieldClass(false)} />
        </label>
        <div className="flex flex-col gap-1">
          <span className={ctl.label}>Duration</span>
          <span className="flex h-11 items-center font-mono text-[15px] font-semibold text-[#0e0e12] sm:h-10 sm:text-sm">{trimDuration.toFixed(0)}s</span>
        </div>
      </div>
      {setAroundButton}
      {createButton}
      {cutTitle ? <p className="w-full text-xs text-[#5b6070]">{cutTitle}</p> : selectionHint ? <p className="w-full text-xs font-medium text-[#7a4a00]">{selectionHint}</p> : null}
    </div>
  );

  if (maximized) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0f1c] text-white md:grid md:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 px-3 pb-4 pt-3 sm:px-5">
          <div className="flex h-11 items-center gap-3 overflow-x-auto">
            <span className="font-display whitespace-nowrap text-[26px] leading-none tracking-[0.02em]">{title}</span>
            <span className="hidden whitespace-nowrap text-[13px] font-medium text-[#a9b3cc] sm:inline">Clip editor</span>
            {sources.length > 1 ? sourcePills : null}
            {selectionChip}
            <button type="button" onClick={() => setMax(false)} className="ml-auto inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-[#3a4560] px-3.5 text-[13px] font-semibold text-white hover:bg-white/10">
              Exit fullscreen <span className="font-mono text-xs text-[#a9b3cc]">Esc</span>
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center">{player}</div>
          {controls}
          {timeline}
          {marksStrip}
          {trimRow}
        </div>
        {clipsPanel}
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_380px] md:items-start md:gap-6 md:rounded-xl md:border md:border-[#e3e6ec] md:bg-white md:p-5">
      <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-[#e3e6ec] bg-white p-3 md:gap-3.5 md:rounded-none md:border-0 md:p-0">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-[26px] leading-none tracking-[0.02em] text-[#0e0e12] sm:text-[28px]">Clip editor</h2>
          <button type="button" onClick={() => setMax(true)} className="ml-auto inline-flex h-11 items-center rounded-lg border border-[#d5d9e2] bg-white px-3 text-[13px] font-semibold text-[#0e0e12] hover:bg-[#f4f5f8] sm:ml-0 sm:h-8 sm:px-2.5">
            Fullscreen
          </button>
          {sources.length > 1 ? <div className="w-full sm:w-auto">{sourcePills}</div> : null}
          <span className="hidden sm:ml-auto sm:inline-flex">{selectionChip}</span>
        </div>
        {player}
        {controls}
        {mobileZoomRow}
        {timeline}
        {marksStrip}
        {trimRow}
      </div>
      {clipsPanel}
    </div>
  );
}
