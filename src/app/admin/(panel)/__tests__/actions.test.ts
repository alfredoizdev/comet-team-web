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
}));
vi.mock("@/lib/r2/client", () => ({ deleteObjects: vi.fn() }));

import { requireMember } from "@/lib/auth/members";
import { getVideoWithProject, updateVideo } from "@/lib/videos/repo";
import { setPublished } from "../actions";

const project = (team: Project["team"]): Project => ({
  id: "p1", user_id: "u1", title: "Match", team, match_date: null, opponent: null, created_at: "",
});
const video = (over: Partial<Video>): Video => ({
  id: "v1", project_id: "p1", file_path: "u1/v1/video.mp4", status: "done", error_message: null, duration: 100,
  highlight_reel_path: "v1/highlight_reel.mp4", is_published: false, published_at: null, source_deleted_at: null, source_url: null,
  created_at: "", ...over,
});

beforeEach(() => {
  vi.mocked(requireMember).mockResolvedValue({ userId: "u1", email: "c@x.com", role: "coach", team: "girls" });
  vi.mocked(updateVideo).mockReset();
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
