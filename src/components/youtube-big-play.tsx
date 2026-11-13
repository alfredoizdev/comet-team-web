"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import type { Team } from "@/lib/teams";

/** YouTube full match: team-colour play circle first; pressing it swaps in the embed, already playing. */
export function YouTubeBigPlay({ id, title, label, team, ariaLabel }: { id: string; title: string; label?: string; team: Team; ariaLabel: string }) {
  const [started, setStarted] = useState(false);
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-[#0e1424] md:rounded-2xl">
      {started ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1&autoplay=1`}
          title={title}
          className="size-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" className="size-full object-cover" />
          <button
            type="button"
            aria-label={ariaLabel}
            onClick={() => setStarted(true)}
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
      )}
    </div>
  );
}
