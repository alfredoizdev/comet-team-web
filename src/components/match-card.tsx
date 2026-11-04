import { HlsVideo } from "@/components/hls-video";
import { MomentsGallery } from "@/components/moments-gallery";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VideoPoster } from "@/components/video-poster";
import { matchDateLabel, matchHeading, type PublicFullMatch, type PublicMatch } from "@/lib/videos/public";

export function MatchCard({ match, accentBg }: { match: PublicMatch; accentBg: string }) {
  const title = matchHeading(match);
  const date = matchDateLabel(match);

  const highlights = (
    <div className="flex flex-col gap-4">
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
          <div className="flex flex-col gap-3">
            <MomentsGallery clips={match.clips} accentBg={accentBg} matchTitle={title} />
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <article className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-[44px] leading-[0.95] text-[#0e0e12] sm:text-[56px]">{title}</h1>
        {date ? <time dateTime={match.matchDate ?? undefined} className="text-base text-[#6b6b76]">{date}</time> : null}
      </header>
      {match.fullMatch ? (
        <Tabs defaultValue="highlights" className="gap-4">
          <TabsList className="h-12 gap-1 rounded-full bg-[#ececf0] p-1">
            <TabsTrigger value="highlights" className="h-10 rounded-full px-5 text-base font-semibold data-active:bg-white data-active:shadow-sm">Highlights</TabsTrigger>
            <TabsTrigger value="full" className="h-10 rounded-full px-5 text-base font-semibold data-active:bg-white data-active:shadow-sm">Full match</TabsTrigger>
          </TabsList>
          <TabsContent value="highlights">{highlights}</TabsContent>
          <TabsContent value="full">
            <FullMatchPlayer source={match.fullMatch} title={title} />
          </TabsContent>
        </Tabs>
      ) : (
        highlights
      )}
    </article>
  );
}

function FullMatchPlayer({ source, title }: { source: PublicFullMatch; title: string }) {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
      {source.kind === "youtube" ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${source.id}?rel=0&modestbranding=1&playsinline=1`}
          title={`${title} · full match`}
          className="size-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      ) : (
        <HlsVideo src={source.url} controls playsInline preload="metadata" className="size-full" />
      )}
    </div>
  );
}
