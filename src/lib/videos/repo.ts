// Service-role data access for the admin panel and public pages.
// Kept thin and mockable: server actions call these instead of chaining
// supabase-js queries inline.
import type { Clip, Project, Team, Video } from "@/lib/db/types";
import { createServiceClient } from "@/lib/supabase/server";

export type MatchRow = { project: Project; video: Video | null; clipCount: number };

function db() {
  return createServiceClient();
}

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`${context}: ${error?.message ?? "unknown error"}`);
}

export async function getProject(projectId: string): Promise<Project | null> {
  const { data, error } = await db().from("projects").select("*").eq("id", projectId).maybeSingle();
  if (error) fail("getProject", error);
  return (data as Project | null) ?? null;
}

export async function insertProject(input: Omit<Project, "id" | "created_at">): Promise<Project> {
  const { data, error } = await db().from("projects").insert(input).select("*").single();
  if (error || !data) fail("insertProject", error);
  return data as Project;
}

export async function deleteProjectRow(projectId: string): Promise<void> {
  const { error } = await db().from("projects").delete().eq("id", projectId);
  if (error) fail("deleteProjectRow", error);
}

export async function getVideoForProject(projectId: string): Promise<Video | null> {
  const { data, error } = await db().from("videos").select("*").eq("project_id", projectId).maybeSingle();
  if (error) fail("getVideoForProject", error);
  return (data as Video | null) ?? null;
}

export async function getVideoByKey(key: string): Promise<{ id: string } | null> {
  const { data, error } = await db().from("videos").select("id").eq("file_path", key).maybeSingle();
  if (error) fail("getVideoByKey", error);
  return (data as { id: string } | null) ?? null;
}

export async function getVideoWithProject(videoId: string): Promise<{ video: Video; project: Project } | null> {
  const { data, error } = await db().from("videos").select("*, projects(*)").eq("id", videoId).maybeSingle();
  if (error) fail("getVideoWithProject", error);
  if (!data) return null;
  const { projects, ...video } = data as Video & { projects: Project };
  return { video: video as Video, project: projects };
}

export async function insertVideo(input: Pick<Video, "id" | "project_id" | "file_path"> & Partial<Pick<Video, "source_url">>): Promise<void> {
  const { error } = await db().from("videos").insert({ ...input, status: "uploaded" });
  if (error) fail("insertVideo", error);
}

export async function updateVideo(videoId: string, patch: Partial<Video>): Promise<void> {
  const { error } = await db().from("videos").update(patch).eq("id", videoId);
  if (error) fail("updateVideo", error);
}

export async function listClips(videoId: string): Promise<Clip[]> {
  const { data, error } = await db().from("clips").select("*").eq("video_id", videoId).order("start_time");
  if (error) fail("listClips", error);
  return (data as Clip[]) ?? [];
}

export async function getClipWithVideo(clipId: string): Promise<{ clip: Clip; video: Video; project: Project } | null> {
  const { data, error } = await db().from("clips").select("*, videos(*, projects(*))").eq("id", clipId).maybeSingle();
  if (error) fail("getClipWithVideo", error);
  if (!data) return null;
  const { videos, ...clip } = data as Clip & { videos: Video & { projects: Project } };
  const { projects, ...video } = videos;
  return { clip: clip as Clip, video: video as Video, project: projects };
}

export async function insertClip(input: Pick<Clip, "id" | "video_id" | "start_time" | "end_time" | "score" | "file_path">): Promise<void> {
  const { error } = await db().from("clips").insert(input);
  if (error) fail("insertClip", error);
}

export async function deleteClipRow(clipId: string): Promise<void> {
  const { error } = await db().from("clips").delete().eq("id", clipId);
  if (error) fail("deleteClipRow", error);
}

export async function deleteClipsForVideo(videoId: string): Promise<void> {
  const { error } = await db().from("clips").delete().eq("video_id", videoId);
  if (error) fail("deleteClipsForVideo", error);
}

/** Matches for the panel: all teams when `team` is null (admin). */
export async function listMatchRows(team: Team | null): Promise<MatchRow[]> {
  let query = db()
    .from("projects")
    .select("*, videos(*, clips(id))")
    .order("match_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (team) query = query.eq("team", team);
  const { data, error } = await query;
  if (error) fail("listMatchRows", error);
  type Row = Project & { videos: (Video & { clips: { id: string }[] })[] };
  return ((data as Row[]) ?? []).map(({ videos, ...project }) => {
    const v = videos[0];
    if (!v) return { project: project as Project, video: null, clipCount: 0 };
    const { clips, ...video } = v;
    return { project: project as Project, video: video as Video, clipCount: clips.length };
  });
}

/** Published, finished videos of a team with their clips, newest match first. */
export async function listPublishedRows(team: Team): Promise<{ project: Project; video: Video; clips: Clip[] }[]> {
  const { data, error } = await db()
    .from("projects")
    .select("*, videos!inner(*, clips(*))")
    .eq("team", team)
    .eq("videos.is_published", true)
    .eq("videos.status", "done")
    .order("match_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) fail("listPublishedRows", error);
  type Row = Project & { videos: (Video & { clips: Clip[] })[] };
  return ((data as Row[]) ?? []).flatMap(({ videos, ...project }) => {
    const v = videos[0];
    if (!v) return [];
    const { clips, ...video } = v;
    return [{ project: project as Project, video: video as Video, clips }];
  });
}

export async function listOpponentNames(): Promise<string[]> {
  const { data, error } = await db().from("opponents").select("name").order("name");
  if (error) fail("listOpponentNames", error);
  return ((data as { name: string }[]) ?? []).map((o) => o.name);
}

/** Remembers an opponent name (case-insensitive unique). */
export async function rememberOpponent(name: string): Promise<void> {
  const { data, error } = await db().from("opponents").select("id").ilike("name", name).limit(1);
  if (error) fail("rememberOpponent", error);
  if (data && data.length > 0) return;
  const { error: insertError } = await db().from("opponents").insert({ name });
  // A concurrent insert of the same name trips the lower(name) unique index: fine.
  if (insertError && insertError.code !== "23505") fail("rememberOpponent", insertError);
}
