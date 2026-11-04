import Link from "next/link";
import { Play } from "lucide-react";
import { VideoPoster } from "@/components/video-poster";
import type { Team } from "@/lib/teams";
import { matchDateLabel, matchHeading, type PublicMatch } from "@/lib/videos/public";

/** Hero of the team page: the most recent published match. */
export function LatestMatch({ match, team }: { match: PublicMatch; team: Team }) {
  const href = `/${team.slug}/${match.id}`;
  const date = matchDateLabel(match);
  return (
    <section className="grid gap-3 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:items-center md:gap-10">
      <Link href={href} className="group relative block aspect-video overflow-hidden rounded-2xl bg-[#dfe2ea]">
        {match.reelUrl ? (
          <VideoPoster src={match.reelUrl} muted preload="metadata" playsInline className="size-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-sm font-medium text-[#6b6b76]">Highlight reel is being rebuilt</span>
        )}
        <span className={`${team.bg} absolute left-1/2 top-1/2 flex size-[76px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-white shadow-xl transition-transform duration-300 group-hover:scale-110`}>
          <Play className="ml-1 size-8 fill-current" />
        </span>
        <span className={`${team.bg} absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-semibold text-white md:hidden`}>Latest match</span>
        {match.fullMatch ? (
          <span className="absolute right-3 top-3 rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#0e0e12] shadow-sm md:left-3 md:right-auto">Full match</span>
        ) : null}
      </Link>
      <div className="flex flex-col gap-2 md:gap-3">
        <p className={`hidden text-xs font-bold uppercase tracking-[0.14em] md:block ${team.text}`}>Latest match</p>
        <h2 className="font-display text-[40px] leading-[0.9] text-[#0e0e12] md:text-[64px]">
          <Link href={href}>{matchHeading(match)}</Link>
        </h2>
        <p className="hidden text-[17px] font-medium text-[#0e0e12] md:block">{date}</p>
        <p className="text-sm text-[#5b6070] md:text-[15px]">
          <span className="md:hidden">{date} · {match.clips.length} moments</span>
          <span className="hidden md:inline">{match.clips.length} moments · {match.fullMatch ? "Highlights and full match" : "Highlights"}</span>
        </p>
        <Link href={href} className={`${team.bg} mt-1 hidden w-fit items-center rounded-full px-6 py-3 text-[15px] font-semibold text-white transition hover:opacity-90 md:inline-flex`}>
          Watch highlights
        </Link>
      </div>
    </section>
  );
}
