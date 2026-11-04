import type { Team as TeamSlug } from "@/lib/db/types";

export type { TeamSlug };

export type Team = {
  slug: TeamSlug;
  name: string;
  shortName: string;
  /** Tailwind classes with the team color. */
  bg: string;
  bgDeep: string;
  text: string;
  border: string;
  /** Hover ring of outlined cards (literal so Tailwind generates it). */
  hoverBorder: string;
  /** Selected tab card of the match page. */
  tabActive: string;
};

export const CLUB_NAME = "Comet SC";
export const CREST_SRC = "/escudo.png";

export const teams: Record<TeamSlug, Team> = {
  girls: { slug: "girls", name: "Girls Team", shortName: "Comets Girls", bg: "bg-girls", bgDeep: "bg-girls-deep", text: "text-girls", border: "border-girls", hoverBorder: "hover:border-girls", tabActive: "data-active:bg-girls data-active:text-white" },
  boys: { slug: "boys", name: "Boys Team", shortName: "Comets Boys", bg: "bg-boys", bgDeep: "bg-boys-deep", text: "text-boys", border: "border-boys", hoverBorder: "hover:border-boys", tabActive: "data-active:bg-boys data-active:text-white" },
};

export const teamSlugs = Object.keys(teams) as TeamSlug[];

export function isTeamSlug(value: string): value is TeamSlug {
  return value in teams;
}
