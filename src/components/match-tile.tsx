import Link from "next/link";
import { Play } from "lucide-react";
import { VideoPoster } from "@/components/video-poster";
import type { PublicMatch } from "@/lib/videos/public";
import { matchHeading, matchDateLabel } from "@/lib/videos/public";

/** Grid tile on the team page: reel poster + title + date, linking to the match page. */
export function MatchTile({ match, teamSlug, accentBg }: { match: PublicMatch; teamSlug: string; accentBg: string }) {
  return (
    <Link href={`/${teamSlug}/${match.id}`} className="group flex flex-col gap-3.5 text-[#0e0e12]">
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-[#ececf0]">
        {match.reelUrl ? (
          <VideoPoster src={match.reelUrl} muted preload="metadata" playsInline className="size-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-sm font-medium text-[#6b6b76]">Highlight reel is being rebuilt</span>
        )}
        <span className={`${accentBg} absolute left-1/2 top-1/2 flex size-[60px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-white shadow-lg transition-transform duration-300 group-hover:scale-110`}>
          <Play className="ml-1 size-6 fill-current" />
        </span>
        {match.clips.length > 0 ? (
          <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white">
            {match.clips.length} moments
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-[17px] font-semibold leading-[1.35]">{matchHeading(match)}</h2>
        <p className="text-sm text-[#6b6b76]">{matchDateLabel(match) ?? "Date to be announced"}</p>
      </div>
    </Link>
  );
}
