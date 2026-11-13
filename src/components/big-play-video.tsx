"use client";

import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { useHls } from "@/components/hls-video";
import type { Team } from "@/lib/teams";

/**
 * Player of the public match page (design 3a/3b): dark frame, big white play
 * button and a label pill while idle; native controls once it is playing.
 */
export function BigPlayVideo({ src, label, team, ariaLabel }: { src: string; label?: string; team: Team; ariaLabel: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  useHls(ref, src);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sync = () => setPlaying(!el.paused && !el.ended);
    el.addEventListener("play", sync);
    el.addEventListener("pause", sync);
    el.addEventListener("ended", sync);
    return () => {
      el.removeEventListener("play", sync);
      el.removeEventListener("pause", sync);
      el.removeEventListener("ended", sync);
    };
  }, []);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-[#0e1424] md:rounded-2xl">
      <video ref={ref} controls={playing} playsInline preload="metadata" className="size-full" />
      {!playing ? (
        <>
          <button
            type="button"
            aria-label={ariaLabel}
            onClick={() => void ref.current?.play().catch(() => undefined)}
            className={`absolute left-1/2 top-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-white shadow-[0_8px_24px_rgba(0,0,0,0.3)] transition-transform hover:scale-105 md:size-24 ${team.bg}`}
          >
            <Play className="ml-1 size-7 fill-current md:ml-1.5 md:size-10" />
          </button>
          {label ? (
            <span className="pointer-events-none absolute bottom-2.5 left-2.5 rounded-full bg-black/65 px-2.5 py-1 text-xs font-semibold text-white md:bottom-5 md:left-5 md:px-3.5 md:py-1.5 md:text-sm">
              {label}
            </span>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
