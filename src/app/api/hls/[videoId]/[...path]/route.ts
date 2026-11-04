import { NextResponse } from "next/server";
import { canManage, getMemberForUser } from "@/lib/auth/members";
import { getObjectText, presignGet } from "@/lib/r2/client";
import { createClient } from "@/lib/supabase/server";
import { isAllowedPlaylistPath, rewritePlaylist } from "@/lib/videos/hls";
import * as repo from "@/lib/videos/repo";

/**
 * Serves the HLS playlists of a full match. The master playlist goes out as stored
 * (its rendition URIs are relative, so they come back to this route); a rendition
 * playlist has every segment URI replaced by a presigned R2 URL. Allowed for anyone
 * when the match is published, otherwise only for members who manage that team.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ videoId: string; path: string[] }> }) {
  const { videoId, path } = await ctx.params;
  if (!isAllowedPlaylistPath(path)) return new NextResponse("Not found", { status: 404 });

  const found = await repo.getVideoWithProject(videoId);
  if (!found || !found.video.hls_path) return new NextResponse("Not found", { status: 404 });
  if (!found.video.is_published) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const member = user ? await getMemberForUser(user) : null;
    if (!member || !canManage(member, found.project.team)) return new NextResponse("Not found", { status: 404 });
  }

  const folder = path.length === 1 ? found.video.hls_path : `${found.video.hls_path}/${path[0]}`;
  const stored = await getObjectText(`${folder}/${path[path.length - 1]}`);
  const body = path.length === 1 ? stored : await rewritePlaylist(stored, (uri) => presignGet(`${folder}/${uri}`));
  return new NextResponse(body, {
    headers: { "Content-Type": "application/vnd.apple.mpegurl", "Cache-Control": "private, no-store" },
  });
}
