import Image from "next/image";
import Link from "next/link";
import { InkBurst } from "@/components/ink-burst";
import { CLUB_NAME, CREST_SRC, teams, type TeamSlug } from "@/lib/teams";

export default function Home() {
  return (
    <main className="split relative flex min-h-dvh flex-col overflow-hidden md:flex-row">
      <h1 className="sr-only">{CLUB_NAME}</h1>
      <TeamSide slug="girls" />
      <TeamSide slug="boys" />
      <InkBurst />

      <div
        className="split-crest pointer-events-none absolute top-1/2 z-20 flex size-[150px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-[0_12px_40px_rgba(0,0,0,0.18)] md:size-[300px]"
        aria-hidden="true"
      >
        <Image
          src={CREST_SRC}
          alt=""
          width={250}
          height={250}
          priority
          className="size-[124px] object-contain md:size-[250px]"
        />
      </div>
    </main>
  );
}

function TeamSide({ slug }: { slug: TeamSlug }) {
  const team = teams[slug];
  const [first, second] = team.name.split(" ");
  const isGirls = slug === "girls";

  return (
    <Link
      href={`/${team.slug}`}
      className={`split-side split-${slug} ${team.bg} relative flex flex-col items-center justify-center text-white ${
        isGirls ? "pb-[90px] md:pb-0 md:pr-[180px]" : "pt-[90px] md:pt-0 md:pl-[180px]"
      }`}
    >
      <span className="split-dim pointer-events-none absolute inset-0 bg-black" />
      <span className="relative flex flex-col items-center gap-5 md:gap-8">
        <span className="font-display text-center text-[88px] leading-[0.85] tracking-[0.01em] md:text-[clamp(120px,11.7vw,168px)]">
          {first}
          <br />
          {second}
        </span>
        <span
          className={`${isGirls ? "border-boys text-boys" : "border-girls text-girls"} inline-flex min-h-12 items-center justify-center rounded-full border-[3px] px-7 text-base font-semibold uppercase transition-transform duration-200 hover:-translate-y-0.5 md:h-14 md:px-8 md:text-[17px]`}
        >
          Watch videos
        </span>
      </span>
    </Link>
  );
}
