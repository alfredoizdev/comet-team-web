import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Video } from "@/lib/db/types";

vi.mock("@/lib/auth/members", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/members")>();
  return { ...actual, requireMember: vi.fn() };
});
vi.mock("@/lib/videos/repo", () => ({ getVideoWithProject: vi.fn() }));
vi.mock("@/lib/videos/marks-repo", () => ({
  listMarks: vi.fn(),
  insertMark: vi.fn(),
  deleteMark: vi.fn(),
  deleteMarksForVideo: vi.fn(),
}));

import { requireMember } from "@/lib/auth/members";
import { insertMark, listMarks } from "@/lib/videos/marks-repo";
import { getVideoWithProject } from "@/lib/videos/repo";
import { addMark } from "../marks-actions";

const project: Project = { id: "p1", user_id: "u1", title: "M", team: "girls", match_date: null, opponent: null, created_at: "" };
const video: Video = {
  id: "v1", project_id: "p1", file_path: "u1/v1/video.mp4", status: "done", error_message: null, duration: 100,
  highlight_reel_path: "v1/highlight_reel.mp4", is_published: true, published_at: "x", source_deleted_at: null, source_url: null, stage: null, progress: null, reel_stale: false, hls_path: null, created_at: "",
};

beforeEach(() => {
  vi.mocked(requireMember).mockResolvedValue({ userId: "u1", email: "a@x.com", role: "admin", team: null });
  vi.mocked(getVideoWithProject).mockResolvedValue({ video, project });
  vi.mocked(insertMark).mockClear();
});

describe("addMark", () => {
  it("saves the mark and returns the marks of the video in order", async () => {
    vi.mocked(listMarks).mockResolvedValueOnce([10]).mockResolvedValueOnce([10, 42.5]);
    await expect(addMark("v1", 42.5)).resolves.toEqual([10, 42.5]);
    expect(insertMark).toHaveBeenCalledWith("v1", 42.5);
  });
  it("does not save a mark within 1 s of an existing one", async () => {
    vi.mocked(listMarks).mockResolvedValue([42]);
    await expect(addMark("v1", 42.5)).resolves.toEqual([42]);
    expect(insertMark).not.toHaveBeenCalled();
  });
  it("rejects a time outside the video", async () => {
    vi.mocked(listMarks).mockResolvedValue([]);
    await expect(addMark("v1", 150)).rejects.toThrow();
    expect(insertMark).not.toHaveBeenCalled();
  });
  it("refuses when the full match can't be cut anymore (original deleted)", async () => {
    vi.mocked(getVideoWithProject).mockResolvedValue({ video: { ...video, source_deleted_at: "x" }, project });
    vi.mocked(listMarks).mockResolvedValue([]);
    await expect(addMark("v1", 10)).rejects.toThrow();
  });
});
