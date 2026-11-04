import Link from "next/link";
import { Play } from "lucide-react";
import { BigPlayVideo } from "@/components/big-play-video";
import { MomentsGallery } from "@/components/moments-gallery";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VideoPoster } from "@/components/video-poster";
import type { Team } from "@/lib/teams";
import { formatClock, formatMinutes } from "@/lib/videos/format";
import { matchDateLabel, matchHeading, type PublicFullMatch, type PublicMatch } from "@/lib/videos/public";

/** Public match page body (design 3a–3f): header block, Highlights / Full match cards, moments and more matches. */
export function MatchCard({ match, team, more }: { match: PublicMatch; team: Team; more: PublicMatch[] }) {
  const title = matchHeading(match);
  const date = matchDateLabel(match);
  const moments = match.clips.length;
  const reel = formatClock(match.reelSeconds);
  const full = match.fullMatchSeconds ? formatMinutes(match.fullMatchSeconds) : null;
  const meta = [`${moments} ${moments === 1 ? "moment" : "moments"}`, match.reelKey ? `${reel} highlight reel` : null, match.fullMatch && full ? `${full} full match` : null]
    .filter(Boolean)
    .join(" · ");

  const highlights = (
    <div className="flex flex-col gap-6 md:gap-8">
      {match.reelUrl ? (
        <BigPlayVideo src={match.reelUrl} label={`Highlight reel · ${reel}`} team={team} ariaLabel="Play highlight reel" />
      ) : (
        <div role="status" className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl bg-[#eef0f4] px-4 text-center md:rounded-2xl">
          <span className="text-base font-semibold text-[#0e0e12]">Highlight reel is being rebuilt</span>
          <span className="text-sm text-[#5b6070]">The moments below are ready to watch.</span>
        </div>
      )}
      {moments > 0 ? (
        <div className="flex flex-col gap-4 md:gap-5">
          <div className="flex items-baseline gap-3">
            <h2 className="font-display text-[34px] leading-none text-[#0e0e12] md:text-[44px]">Moments</h2>
            <span className="hidden text-[15px] font-medium text-[#5b6070] sm:inline">Tap a moment to watch the clip</span>
          </div>
          <MomentsGallery clips={match.clips} team={team} matchTitle={title} />
        </div>
      ) : null}
    </div>
  );

  return (
    <article className="flex flex-col gap-5 md:gap-8">
      <header className="flex flex-col gap-2 md:gap-2.5">
        <span className={`hidden w-fit rounded-full bg-[#eef1f7] px-3 py-1 text-[13px] font-semibold md:inline-block ${team.text}`}>
          {team.name}
          {match.opponent ? ` · vs ${match.opponent}` : ""}
        </span>
        <h1 className="font-display text-[52px] leading-[0.9] text-[#0e0e12] md:text-[80px]">{title}</h1>
        {date ? <time dateTime={match.matchDate ?? undefined} className="text-base font-medium text-[#0e0e12] md:text-[17px]">{date}</time> : null}
        <p className="text-sm text-[#5b6070] md:text-[15px]">{meta}</p>
      </header>

      {match.fullMatch ? (
        <Tabs defaultValue="highlights" className="gap-5 md:gap-8">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-none bg-transparent p-0 group-data-horizontal/tabs:h-auto md:gap-3">
            <TabCard team={team} value="highlights" title="Highlights" sub={`${reel} reel · ${moments} moments`} />
            <TabCard team={team} value="full" title="Full match" sub={full ? `${full} · the whole game` : "The whole game"} />
          </TabsList>
          <TabsContent value="highlights">{highlights}</TabsContent>
          <TabsContent value="full">
            <FullMatchPlayer source={match.fullMatch} title={title} team={team} length={full} />
          </TabsContent>
        </Tabs>
      ) : (
        highlights
      )}

      {more.length > 0 ? (
        <section className="mt-2 flex flex-col gap-3 border-t border-[#e3e6ec] pt-6 md:gap-5 md:pt-10">
          <h2 className="font-display text-[30px] leading-none text-[#0e0e12] md:text-[36px]">More matches</h2>
          <ul className="flex flex-col gap-3 md:grid md:grid-cols-2 md:gap-6 lg:grid-cols-3">
            {more.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/${team.slug}/${m.id}`}
                  className={`group flex min-h-16 items-center gap-3 rounded-[14px] text-[#0e0e12] transition md:gap-3.5 md:border md:border-[#e3e6ec] md:p-2.5 ${team.hoverBorder}`}
                >
                  <span className="relative aspect-video w-[120px] shrink-0 overflow-hidden rounded-lg bg-[#dde1e8] md:w-[140px]">
                    {m.reelUrl ? <VideoPoster src={m.reelUrl} muted preload="metadata" playsInline className="size-full object-cover" /> : null}
                    <span className={`${team.bg} absolute left-1/2 top-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-white`}>
                      <Play className="ml-0.5 size-3.5 fill-current" />
                    </span>
                  </span>
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-[15px] font-semibold md:text-base">{matchHeading(m)}</span>
                    <span className="text-[13px] text-[#5b6070] md:text-sm">{matchDateLabel(m)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}

function TabCard({ team, value, title, sub }: { team: Team; value: string; title: string; sub: string }) {
  return (
    <TabsTrigger
      value={value}
      className={`h-auto min-h-16 flex-col items-start justify-center gap-1 rounded-xl border-2 border-[#e3e6ec] bg-white px-3.5 py-2.5 text-left whitespace-normal shadow-none transition ${team.hoverBorder} md:gap-1.5 md:rounded-[14px] md:px-6 md:py-4 ${team.text} ${team.tabActive} data-active:border-transparent group-data-[variant=default]/tabs-list:data-active:shadow-none focus-visible:ring-0 focus-visible:border-[#e3e6ec] data-active:focus-visible:border-transparent`}
    >
      <span className="font-display text-[26px] leading-none tracking-[0.02em] md:text-[32px]">{title}</span>
      <span className="text-xs font-medium opacity-80 md:text-sm">{sub}</span>
    </TabsTrigger>
  );
}

function FullMatchPlayer({ source, title, team, length }: { source: PublicFullMatch; title: string; team: Team; length: string | null }) {
  return (
    <div className="flex flex-col gap-2.5 md:gap-3.5">
      {source.kind === "hls" ? (
        <BigPlayVideo src={source.url} label={length ? `Full match · ${length}` : "Full match"} team={team} ariaLabel="Play full match" />
      ) : (
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black md:rounded-2xl">
        {source.kind === "youtube" ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${source.id}?rel=0&modestbranding=1&playsinline=1`}
            title={`${title} · full match`}
            className="size-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : null}
      </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-[#5b6070] md:text-[15px]">Full match{length ? ` · ${length}` : ""}</span>
        {source.kind === "youtube" ? (
          <a
            href={source.watchUrl}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4 md:text-[15px] ${team.text}`}
          >
            Watch on YouTube ↗
          </a>
        ) : null}
      </div>
    </div>
  );
}
