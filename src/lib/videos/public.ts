import type { ClipWithPlayer, Project, Team, Video } from "@/lib/db/types";
import { presignGet } from "@/lib/r2/client";
import { hlsMasterUrl } from "@/lib/videos/hls";
import { listPublishedRows } from "@/lib/videos/repo";
import { parseYouTubeUrl } from "@/lib/videos/youtube";

const longDate = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "long", year: "numeric" });

/** "Comets vs Dynamo": appends the opponent only when the title does not already name it. */
export function matchHeading(m: Pick<PublicMatch, "title" | "opponent">): string {
  if (!m.opponent) return m.title;
  return m.title.toLowerCase().includes(m.opponent.toLowerCase()) ? m.title : `${m.title} vs ${m.opponent}`;
}

export function matchDateLabel(m: Pick<PublicMatch, "matchDate">): string | null {
  return m.matchDate ? longDate.format(new Date(`${m.matchDate}T12:00:00`)) : null;
}

export type PublicClip = { id: string; startTime: number; url: string; player: string | null };
/** Where the whole match plays from: YouTube embed, or the app's HLS playlist (served with signed segments). */
export type PublicFullMatch = { kind: "youtube"; id: string } | { kind: "hls"; url: string };
export type PublicMatch = {
  id: string;
  title: string;
  opponent: string | null;
  matchDate: string | null;
  /** Object key of the reel; null while the worker rebuilds it. */
  reelKey: string | null;
  reelUrl: string | null;
  reelRebuilding: boolean;
  clips: PublicClip[];
  /** Null while an uploaded match has no streaming copy yet (or its master was never processed). */
  fullMatch: PublicFullMatch | null;
};

function fullMatchOf(video: Video): PublicFullMatch | null {
  const yt = video.source_url ? parseYouTubeUrl(video.source_url) : null;
  if (yt) return { kind: "youtube", id: yt.id };
  if (video.hls_path) return { kind: "hls", url: hlsMasterUrl(video.id) };
  return null;
}

/** Pure selection: published + done videos, ready clips in time order, no signing. */
export function selectPublishable(rows: { project: Project; video: Video; clips: ClipWithPlayer[] }[]): PublicMatch[] {
  return rows
    .filter(({ video }) => video.is_published && video.status === "done")
    .map(({ project, video, clips }) => ({
      id: project.id,
      title: project.title,
      opponent: project.opponent,
      matchDate: project.match_date,
      reelKey: video.highlight_reel_path,
      reelUrl: null,
      reelRebuilding: !video.highlight_reel_path,
      fullMatch: fullMatchOf(video),
      clips: clips
        .filter((c) => c.score > 0)
        .sort((a, b) => a.start_time - b.start_time)
        .map((c) => ({ id: c.id, startTime: c.start_time, url: c.file_path, player: c.player_name })),
    }));
}

/** Published matches of a team with signed URLs. Never throws: the public page must render. */
export async function getPublishedMatches(team: Team): Promise<PublicMatch[]> {
  try {
    const matches = selectPublishable(await listPublishedRows(team));
    // The list only shows reel posters and a clip count; clip URLs are signed on the match page.
    return await Promise.all(
      matches.map(async (m) => ({ ...m, reelUrl: m.reelKey ? await presignGet(m.reelKey) : null })),
    );
  } catch (err) {
    console.error(`[public] could not load ${team} matches:`, err instanceof Error ? err.message : err);
    return [];
  }
}

/** One published match with signed reel and clip URLs, or null if it is not published for that team. */
export async function getPublishedMatch(team: Team, projectId: string): Promise<PublicMatch | null> {
  try {
    const match = selectPublishable(await listPublishedRows(team)).find((m) => m.id === projectId);
    if (!match) return null;
    return {
      ...match,
      reelUrl: match.reelKey ? await presignGet(match.reelKey) : null,
      clips: await Promise.all(match.clips.map(async (c) => ({ ...c, url: await presignGet(c.url) }))),
    };
  } catch (err) {
    console.error(`[public] could not load match ${projectId}:`, err instanceof Error ? err.message : err);
    return null;
  }
}
