import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Video } from "@/lib/db/types";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/members", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/members")>();
  return { ...actual, requireMember: vi.fn() };
});
vi.mock("@/lib/videos/repo", () => ({
  getVideoWithProject: vi.fn(),
  updateVideo: vi.fn(),
  getProject: vi.fn(),
  getVideoForProject: vi.fn(),
  listClips: vi.fn(),
  deleteProjectRow: vi.fn(),
}));
vi.mock("@/lib/r2/client", () => ({ deleteObjects: vi.fn() }));

import { requireMember } from "@/lib/auth/members";
import { deleteObjects } from "@/lib/r2/client";
import { deleteProjectRow, getProject, getVideoForProject, getVideoWithProject, listClips, updateVideo } from "@/lib/videos/repo";
import { deleteMatch, deleteOriginal, setPublished } from "../actions";

const project = (team: Project["team"]): Project => ({
  id: "p1", user_id: "u1", title: "Match", team, match_date: null, opponent: null, created_at: "",
});
const video = (over: Partial<Video>): Video => ({
  id: "v1", project_id: "p1", file_path: "u1/v1/video.mp4", status: "done", error_message: null, duration: 100,
  highlight_reel_path: "v1/highlight_reel.mp4", is_published: false, published_at: null, source_deleted_at: null, source_url: null, stage: null, progress: null, reel_stale: false, hls_path: null,
  created_at: "", ...over,
});

beforeEach(() => {
  vi.mocked(requireMember).mockResolvedValue({ userId: "u1", email: "c@x.com", role: "coach", team: "girls" });
  vi.mocked(updateVideo).mockReset();
  vi.mocked(deleteObjects).mockReset();
});

describe("setPublished", () => {
  it("refuses a girls coach publishing a boys match and writes nothing", async () => {
    vi.mocked(getVideoWithProject).mockResolvedValue({ video: video({}), project: project("boys") });
    await expect(setPublished("v1", true)).rejects.toThrow("Forbidden");
    expect(updateVideo).not.toHaveBeenCalled();
  });
  it("refuses publishing a video whose reel is still being rebuilt", async () => {
    vi.mocked(getVideoWithProject).mockResolvedValue({ video: video({ highlight_reel_path: null }), project: project("girls") });
    await expect(setPublished("v1", true)).rejects.toThrow("Video is not ready to publish");
    expect(updateVideo).not.toHaveBeenCalled();
  });
  it("publishes a ready video of the coach's team", async () => {
    vi.mocked(getVideoWithProject).mockResolvedValue({ video: video({}), project: project("girls") });
    await setPublished("v1", true);
    expect(updateVideo).toHaveBeenCalledWith("v1", expect.objectContaining({ is_published: true }));
  });
});

describe("deleteOriginal", () => {
  it("deletes the master from R2 and stamps source_deleted_at once the streaming copy exists", async () => {
    vi.mocked(getVideoWithProject).mockResolvedValue({ video: video({ hls_path: "v1/hls" }), project: project("girls") });
    await deleteOriginal("v1");
    expect(deleteObjects).toHaveBeenCalledWith(["u1/v1/video.mp4"]);
    expect(updateVideo).toHaveBeenCalledWith("v1", { source_deleted_at: expect.any(String) });
  });
  it("refuses while there is no streaming copy (parents would lose the full match)", async () => {
    vi.mocked(getVideoWithProject).mockResolvedValue({ video: video({ hls_path: null }), project: project("girls") });
    await expect(deleteOriginal("v1")).rejects.toThrow("streaming copy");
    expect(deleteObjects).not.toHaveBeenCalled();
    expect(updateVideo).not.toHaveBeenCalled();
  });
  it("refuses for a YouTube match or an already deleted master", async () => {
    vi.mocked(getVideoWithProject).mockResolvedValue({ video: video({ hls_path: "v1/hls", source_url: "https://youtu.be/x" }), project: project("girls") });
    await expect(deleteOriginal("v1")).rejects.toThrow();
    vi.mocked(getVideoWithProject).mockResolvedValue({ video: video({ hls_path: "v1/hls", source_deleted_at: "2026-01-01" }), project: project("girls") });
    await expect(deleteOriginal("v1")).rejects.toThrow();
    expect(deleteObjects).not.toHaveBeenCalled();
  });
  it("refuses a coach of the other team", async () => {
    vi.mocked(getVideoWithProject).mockResolvedValue({ video: video({ hls_path: "v1/hls" }), project: project("boys") });
    await expect(deleteOriginal("v1")).rejects.toThrow("Forbidden");
  });
});

describe("deleteMatch", () => {
  it("removes clips, reel, master and every HLS object, then the project row", async () => {
    vi.mocked(getProject).mockResolvedValue(project("girls"));
    vi.mocked(getVideoForProject).mockResolvedValue(video({ hls_path: "v1/hls" }));
    vi.mocked(listClips).mockResolvedValue([{ id: "c", video_id: "v1", start_time: 0, end_time: 1, score: 1, file_path: "v1/clip_0.mp4", player_id: null, player_name: null, created_at: "" }]);
    await deleteMatch("p1");
    expect(deleteObjects).toHaveBeenCalledWith([
      "v1/clip_0.mp4",
      "v1/highlight_reel.mp4",
      "u1/v1/video.mp4",
      "v1/hls/master.m3u8",
      "v1/hls/1080p/index.m3u8",
      "v1/hls/1080p/index.ts",
      "v1/hls/720p/index.m3u8",
      "v1/hls/720p/index.ts",
    ]);
    expect(deleteProjectRow).toHaveBeenCalledWith("p1");
  });
});
