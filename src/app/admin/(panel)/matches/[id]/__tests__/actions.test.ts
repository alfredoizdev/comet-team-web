import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClipWithPlayer, Project, Video } from "@/lib/db/types";

vi.mock("@/lib/auth/members", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/members")>();
  return { ...actual, requireMember: vi.fn() };
});
vi.mock("@/lib/videos/repo", () => ({
  getClipWithVideo: vi.fn(),
  deleteClipRow: vi.fn(),
  listClips: vi.fn(),
  updateVideo: vi.fn(),
}));
vi.mock("@/lib/r2/client", () => ({ deleteObjects: vi.fn(), presignGet: vi.fn() }));

import { requireMember } from "@/lib/auth/members";
import { deleteObjects } from "@/lib/r2/client";
import { getClipWithVideo, listClips, updateVideo } from "@/lib/videos/repo";
import { deleteClip } from "../actions";

const project: Project = { id: "p1", user_id: "u1", title: "M", team: "girls", match_date: null, opponent: null, created_at: "" };
const video: Video = {
  id: "v1", project_id: "p1", file_path: "u1/v1/video.mp4", status: "done", error_message: null, duration: 100,
  highlight_reel_path: "v1/highlight_reel.mp4", is_published: true, published_at: "x", source_deleted_at: null, source_url: null, stage: null, progress: null, reel_stale: false, created_at: "",
};
const clip = (id: string, score: number): ClipWithPlayer => ({ id, video_id: "v1", start_time: 1, end_time: 10, score, file_path: `v1/clip_${id}.mp4`, player_id: null, player_name: null, created_at: "" });

beforeEach(() => {
  vi.mocked(requireMember).mockResolvedValue({ userId: "u1", email: "a@x.com", role: "admin", team: null });
  vi.mocked(getClipWithVideo).mockResolvedValue({ clip: clip("a", 2), video, project });
  vi.mocked(deleteObjects).mockClear();
  vi.mocked(updateVideo).mockClear();
});

describe("deleteClip", () => {
  it("marks the reel stale (old reel keeps playing) when other ready clips remain", async () => {
    vi.mocked(listClips).mockResolvedValue([clip("b", 2)]);
    await deleteClip("a");
    expect(deleteObjects).toHaveBeenCalledWith(["v1/clip_a.mp4"]);
    expect(updateVideo).toHaveBeenCalledWith("v1", { reel_stale: true });
  });
  it("unpublishes, drops the reel and flags no_clips when the last ready clip is deleted", async () => {
    vi.mocked(listClips).mockResolvedValue([clip("c", 0)]);
    await deleteClip("a");
    expect(deleteObjects).toHaveBeenCalledWith(["v1/highlight_reel.mp4"]);
    expect(updateVideo).toHaveBeenCalledWith("v1", {
      highlight_reel_path: null,
      is_published: false,
      published_at: null,
      status: "error",
      error_message: "no_clips",
    });
  });
});
