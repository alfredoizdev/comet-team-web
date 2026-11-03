import { MomentsGallery } from "@/components/moments-gallery";
import { VideoPoster } from "@/components/video-poster";
import { matchDateLabel, matchHeading, type PublicMatch } from "@/lib/videos/public";

export function MatchCard({ match, accentBg }: { match: PublicMatch; accentBg: string }) {
  const title = matchHeading(match);
  const date = matchDateLabel(match);

  return (
    <article className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-[44px] leading-[0.95] text-[#0e0e12] sm:text-[56px]">{title}</h1>
        {date ? <time dateTime={match.matchDate ?? undefined} className="text-base text-[#6b6b76]">{date}</time> : null}
      </header>
      {match.reelUrl ? (
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
          <VideoPoster src={match.reelUrl} controls playsInline preload="metadata" className="size-full" />
        </div>
      ) : (
        <div className="flex aspect-video w-full items-center justify-center rounded-xl bg-[#ececf0] text-sm font-medium text-[#6b6b76]">
          Highlight reel is being rebuilt
        </div>
      )}
      {match.clips.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[#6b6b76]">Moments</h3>
          <MomentsGallery clips={match.clips} accentBg={accentBg} matchTitle={title} />
        </div>
      ) : null}
    </article>
  );
}
