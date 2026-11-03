import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CLUB_NAME, CREST_SRC, type Team } from "@/lib/teams";

/** Colored header of the public team pages. `backHref`/`backLabel` point one level up. */
export function TeamHeader({ team, backHref, backLabel }: { team: Team; backHref: string; backLabel: string }) {
  return (
    <header className={`${team.bg} text-white`}>
      <div className="mx-auto flex max-w-[1264px] items-center justify-between gap-6 px-5 py-4 sm:px-8 sm:py-5">
        <Link href={`/${team.slug}`} className="flex items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-white shadow-[0_4px_12px_rgba(0,0,0,0.12)]">
            <Image src={CREST_SRC} alt={`${CLUB_NAME} crest`} width={46} height={46} className="size-[46px] object-contain" />
          </span>
          <span className="font-display whitespace-nowrap text-[32px] leading-none tracking-[0.02em] sm:text-[40px]">{team.shortName}</span>
        </Link>
        <Link
          href={backHref}
          aria-label={backLabel}
          className="inline-flex min-h-11 shrink-0 items-center gap-2 px-1 text-[15px] font-semibold sm:underline sm:underline-offset-4 hover:opacity-85"
        >
          <ArrowLeft className="size-5 sm:size-4" aria-hidden="true" />
          <span className="hidden sm:inline">{backLabel}</span>
        </Link>
      </div>
    </header>
  );
}
