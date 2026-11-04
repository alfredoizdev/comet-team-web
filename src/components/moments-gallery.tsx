"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Play, X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VideoPoster } from "@/components/video-poster";
import type { Team } from "@/lib/teams";
import type { PublicClip } from "@/lib/videos/public";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** "Moment 3 · Orlando" — numbered over the whole match, not the filtered list. */
function momentLabel(all: PublicClip[], clip: PublicClip): string {
  const n = all.indexOf(clip) + 1;
  return clip.player ? `Moment ${n} · ${clip.player}` : `Moment ${n}`;
}

/** Grid of clip thumbnails with player filter pills; clicking one opens the moment viewer (design 3c/3e). */
export function MomentsGallery({ clips: allClips, team, matchTitle }: { clips: PublicClip[]; team: Team; matchTitle: string }) {
  const [index, setIndex] = useState<number | null>(null);
  const [player, setPlayer] = useState<string | null>(null);
  const touchStartX = useRef<number | null>(null);

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

  const pill = (active: boolean) =>
    `min-h-11 shrink-0 whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition md:px-[18px] md:text-[15px] ${
      active ? `${team.bg} ${team.border} text-white` : `border-[#d5d9e2] bg-white ${team.text} hover:bg-[#f4f5f8]`
    }`;

  return (
    <>
      {players.length > 0 ? (
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filter moments by player">
          <button type="button" aria-pressed={player === null} onClick={() => pickPlayer(null)} className={pill(player === null)}>
            All ({allClips.length})
          </button>
          {players.map((p) => (
            <button key={p} type="button" aria-pressed={player === p} onClick={() => pickPlayer(p)} className={pill(player === p)}>
              {p} ({allClips.filter((c) => c.player === p).length})
            </button>
          ))}
        </div>
      ) : null}

      <ul className="grid grid-cols-2 gap-x-3 gap-y-[18px] sm:grid-cols-3 md:gap-x-5 md:gap-y-7 lg:grid-cols-4">
        {clips.map((clip, i) => (
          <li key={clip.id}>
            <button
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Play ${momentLabel(allClips, clip)} at ${formatTime(clip.startTime)}`}
              className="group flex w-full flex-col gap-2 text-left text-[#0e0e12] md:gap-2.5"
            >
              <span className="relative block aspect-video w-full overflow-hidden rounded-[10px] bg-[#dde1e8] md:rounded-xl">
                <VideoPoster src={clip.url} muted preload="metadata" playsInline className="size-full object-cover" />
                <span className={`${team.bg} absolute left-1/2 top-1/2 flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-white transition-transform group-hover:scale-110 md:size-12`}>
                  <Play className="ml-0.5 size-4 fill-current md:size-5" />
                </span>
                <span className="absolute bottom-1.5 right-1.5 rounded-md bg-[#0b0f19]/85 px-[7px] py-0.5 text-xs font-semibold text-white md:bottom-2 md:right-2 md:px-2 md:py-[3px] md:text-[13px]">
                  {formatTime(clip.startTime)}
                </span>
              </span>
              <span className="text-sm font-semibold md:text-[15px]">{momentLabel(allClips, clip)}</span>
            </button>
          </li>
        ))}
      </ul>

      <Dialog open={open} onOpenChange={(o) => !o && setIndex(null)}>
        <DialogContent
          showCloseButton={false}
          className="flex h-dvh w-screen max-w-none flex-col gap-0 rounded-none border-0 bg-[#0a0f1c] p-0 text-white sm:h-auto sm:max-h-[94vh] sm:w-[min(96vw,1240px)] sm:max-w-none sm:rounded-2xl"
        >
          <DialogTitle className="sr-only">
            {current ? `${matchTitle}: ${momentLabel(allClips, current)} at ${formatTime(current.startTime)}` : matchTitle}
          </DialogTitle>
          {current ? (
            <div
              className="flex h-full flex-col"
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
              <div className="flex items-center justify-between px-4 py-4 sm:px-10 sm:pt-6">
                <span className="text-[15px] font-semibold sm:text-base">
                  {index! + 1} / {clips.length}
                </span>
                <DialogClose
                  aria-label="Close"
                  className={`flex size-11 items-center justify-center rounded-full bg-white sm:size-12 ${team.text}`}
                >
                  <X className="size-5" />
                </DialogClose>
              </div>
              <div className="flex flex-1 flex-col justify-center gap-[18px] sm:gap-6 sm:px-10 sm:pb-8">
                <div className="flex items-center gap-8">
                  {clips.length > 1 ? (
                    <button type="button" onClick={() => go(-1)} aria-label="Previous moment" className={`hidden size-14 shrink-0 items-center justify-center rounded-full bg-white sm:flex ${team.text}`}>
                      <ChevronLeft className="size-6" />
                    </button>
                  ) : null}
                  <video key={current.id} src={current.url} controls autoPlay playsInline className="aspect-video w-full min-w-0 bg-[#1a2134] sm:rounded-2xl" onEnded={() => go(1)} />
                  {clips.length > 1 ? (
                    <button type="button" onClick={() => go(1)} aria-label="Next moment" className={`hidden size-14 shrink-0 items-center justify-center rounded-full bg-white sm:flex ${team.text}`}>
                      <ChevronRight className="size-6" />
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1.5 px-4 sm:mx-auto sm:w-full sm:max-w-[1040px] sm:flex-row sm:items-baseline sm:justify-between sm:gap-4 sm:px-0">
                  <span className="font-display text-[34px] leading-none tracking-[0.02em] sm:text-[36px]">{momentLabel(allClips, current)}</span>
                  <span className="text-sm font-medium text-[#c9d2e6] sm:text-[15px]">
                    {formatTime(current.startTime)} · {matchTitle}
                  </span>
                </div>
              </div>
              {clips.length > 1 ? (
                <div className="grid grid-cols-2 gap-2.5 px-4 pb-8 pt-4 sm:hidden">
                  <button type="button" onClick={() => go(-1)} className="min-h-14 rounded-[14px] border border-[#3a4560] text-base font-semibold text-white">
                    ‹ Previous
                  </button>
                  <button type="button" onClick={() => go(1)} className={`min-h-14 rounded-[14px] bg-white text-base font-semibold ${team.text}`}>
                    Next ›
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
