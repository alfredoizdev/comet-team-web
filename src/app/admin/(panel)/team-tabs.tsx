"use client";

import { useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TEAMS, type Team } from "@/lib/db/types";
import { teams } from "@/lib/teams";

/** Girls/Boys tabs that keep the selection in the URL (?team=) so "New match" can preselect it. */
export function TeamTabs({ selected }: { selected: Team }) {
  const router = useRouter();
  return (
    <Tabs value={selected} onValueChange={(v) => router.replace(`/admin?team=${v}`)}>
      <TabsList>
        {TEAMS.map((team) => (
          <TabsTrigger key={team} value={team}>
            {teams[team].name}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
