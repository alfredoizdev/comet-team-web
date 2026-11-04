import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CLUB_NAME, CREST_SRC, type Team } from "@/lib/teams";

/** White header of the public team pages with a stripe in the team color. `backHref`/`backLabel` point one level up. */
export function TeamHeader({ team, backHref, backLabel }: { team: Team; backHref: string; backLabel: string }) {
  return (
    <header className={`border-t-4 ${team.border} border-b border-b-[#ececf0] bg-white`}>
      <div className="mx-auto flex max-w-[1264px] items-center justify-between gap-4 px-5 py-3.5 sm:px-8 sm:py-5">
        <Link href={`/${team.slug}`} className="flex min-w-0 items-center gap-3 sm:gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white shadow-[0_4px_14px_rgba(0,0,0,0.14)] sm:size-14">
            <Image src={CREST_SRC} alt={`${CLUB_NAME} crest`} width={46} height={46} className="size-10 object-contain sm:size-[46px]" />
          </span>
          <span className={`font-display truncate text-[28px] leading-none tracking-[0.02em] sm:text-[36px] ${team.text}`}>{team.shortName}</span>
        </Link>
        <Link
          href={backHref}
          className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-[#dcdce3] bg-white px-4 text-[15px] font-semibold transition hover:bg-[#f4f4f7] ${team.text}`}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          <span>{backLabel}</span>
        </Link>
      </div>
    </header>
  );
}
