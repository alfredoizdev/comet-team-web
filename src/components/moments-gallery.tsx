"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VideoPoster } from "@/components/video-poster";
import type { PublicClip } from "@/lib/videos/public";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Grid of clip thumbnails; clicking one opens a large modal with a carousel over all clips. */
export function MomentsGallery({ clips: allClips, accentBg, matchTitle }: { clips: PublicClip[]; accentBg: string; matchTitle: string }) {
  const [index, setIndex] = useState<number | null>(null);
  const [player, setPlayer] = useState<string | null>(null);
  const touchStartX = useRef<number | null>(null);

  // Player filter pills: one per player named on at least one clip.
  const players = Array.from(new Set(allClips.map((c) => c.player).filter((p): p is string => !!p))).sort((a, b) => a.localeCompare(b));
  const clips = player ? allClips.filter((c) => c.player === player) : allClips;

  const open = index !== null;
  const current = index === null ? null : clips[index];

  const go = useCallback(
    (delta: number) => {
      setIndex((i) => (i === null ? i : (i + delta + clips.length) % clips.length));
    },
    [clips.length],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, go]);

  function pickPlayer(next: string | null) {
    setPlayer(next);
    setIndex(null);
  }

  return (
    <>
      {players.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter moments by player">
          <button
            type="button"
            onClick={() => pickPlayer(null)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${player === null ? `${accentBg} text-white` : "bg-[#ececf0] text-[#0e0e12] hover:bg-neutral-200"}`}
          >
            All ({allClips.length})
          </button>
          {players.map((p) => {
            const count = allClips.filter((c) => c.player === p).length;
            return (
              <button
                key={p}
                type="button"
                onClick={() => pickPlayer(p)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${player === p ? `${accentBg} text-white` : "bg-[#ececf0] text-[#0e0e12] hover:bg-neutral-200"}`}
              >
                {p} ({count})
              </button>
            );
          })}
        </div>
      ) : null}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {clips.map((clip, i) => (
          <li key={clip.id}>
            <button
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Play moment ${i + 1} at ${formatTime(clip.startTime)}`}
              className="group relative aspect-video w-full overflow-hidden rounded-xl bg-neutral-900"
            >
              <VideoPoster src={clip.url} muted preload="metadata" playsInline className="size-full object-cover" />
              <span className={`${accentBg} absolute left-1/2 top-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-white shadow-lg transition-transform group-hover:scale-110`}>
                <Play className="ml-0.5 size-5 fill-current" />
              </span>
              <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white">{formatTime(clip.startTime)}</span>
              {clip.player ? (
                <span className={`${accentBg} absolute bottom-2 left-2 max-w-[70%] truncate rounded px-1.5 py-0.5 text-xs font-semibold text-white`}>{clip.player}</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>

      <Dialog open={open} onOpenChange={(o) => !o && setIndex(null)}>
        <DialogContent className="w-[96vw] max-w-6xl gap-0 border-0 bg-black p-0 text-white sm:max-w-6xl sm:p-0">
          <DialogTitle className="sr-only">
            {current ? `${matchTitle}: moment ${index! + 1} of ${clips.length} at ${formatTime(current.startTime)}` : matchTitle}
          </DialogTitle>
          {current ? (
            <div
              className="relative"
              onTouchStart={(e) => {
                touchStartX.current = e.touches[0]?.clientX ?? null;
              }}
              onTouchEnd={(e) => {
                const start = touchStartX.current;
                const end = e.changedTouches[0]?.clientX;
                touchStartX.current = null;
                if (start === null || end === undefined) return;
                if (end - start > 50) go(-1);
                if (start - end > 50) go(1);
              }}
            >
              <video key={current.id} src={current.url} controls autoPlay playsInline className="aspect-video w-full rounded-lg bg-black" onEnded={() => go(1)} />
              {clips.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() => go(-1)}
                    aria-label="Previous moment"
                    className="absolute left-2 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80 sm:left-3 sm:size-12"
                  >
                    <ChevronLeft className="size-6" />
                  </button>
                  <button
                    type="button"
                    onClick={() => go(1)}
                    aria-label="Next moment"
                    className="absolute right-2 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80 sm:right-3 sm:size-12"
                  >
                    <ChevronRight className="size-6" />
                  </button>
                </>
              ) : null}
              <div className="flex items-center justify-between px-4 py-3 text-sm text-white/80">
                <span>
                  Moment {index! + 1} of {clips.length} · {formatTime(current.startTime)}
                  {current.player ? <span className="font-semibold text-white"> · {current.player}</span> : null}
                </span>
                <span className="hidden sm:inline">Use ← → to move between moments</span>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
