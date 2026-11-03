import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/lib/db/types";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/members", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/members")>();
  return { ...actual, requireMember: vi.fn() };
});
vi.mock("@/lib/videos/repo", () => ({
  getProject: vi.fn(),
  getVideoForProject: vi.fn(),
  getVideoByKey: vi.fn(),
  insertVideo: vi.fn(),
}));
vi.mock("@/lib/r2/client", () => ({
  headObject: vi.fn(),
  completeMultipart: vi.fn(),
  abortMultipart: vi.fn(),
  deleteObjects: vi.fn(),
  presignPut: vi.fn(),
  createMultipart: vi.fn(),
  presignPart: vi.fn(),
}));

import { requireMember } from "@/lib/auth/members";
import { completeMultipart, headObject } from "@/lib/r2/client";
import { getProject, insertVideo } from "@/lib/videos/repo";
import { completeUpload } from "../actions";

const project: Project = { id: "p1", user_id: "u1", title: "Match", team: "girls", match_date: null, opponent: null, created_at: "" };

beforeEach(() => {
  vi.mocked(requireMember).mockResolvedValue({ userId: "u1", email: "a@x.com", role: "admin", team: null });
  vi.mocked(getProject).mockResolvedValue(project);
  vi.mocked(insertVideo).mockReset();
});

describe("completeUpload", () => {
  it("does not insert a video row when the object is missing in R2", async () => {
    vi.mocked(headObject).mockResolvedValue(null);
    await expect(completeUpload({ projectId: "p1", videoId: "v1", key: "u1/v1/video.mp4" })).rejects.toThrow(
      "Upload not found in storage",
    );
    expect(insertVideo).not.toHaveBeenCalled();
  });
  it("completes the multipart upload, verifies the object and inserts the row", async () => {
    vi.mocked(headObject).mockResolvedValue({ size: 123 });
    await completeUpload({ projectId: "p1", videoId: "v1", key: "u1/v1/video.mp4", uploadId: "up1", parts: [{ ETag: "e", PartNumber: 1 }] });
    expect(completeMultipart).toHaveBeenCalledWith("u1/v1/video.mp4", "up1", [{ ETag: "e", PartNumber: 1 }]);
    expect(insertVideo).toHaveBeenCalledWith({ id: "v1", project_id: "p1", file_path: "u1/v1/video.mp4" });
  });
  it("refuses a key outside the member's own folder", async () => {
    await expect(completeUpload({ projectId: "p1", videoId: "v1", key: "someone-else/v1/video.mp4" })).rejects.toThrow("Forbidden");
    expect(insertVideo).not.toHaveBeenCalled();
  });
});

import { abortMultipart, deleteObjects } from "@/lib/r2/client";
import { getVideoByKey } from "@/lib/videos/repo";
import { abortUpload } from "../actions";

describe("completeUpload cleanup", () => {
  it("removes the object from R2 when the video row cannot be inserted", async () => {
    vi.mocked(headObject).mockResolvedValue({ size: 123 });
    vi.mocked(insertVideo).mockRejectedValue(new Error("insertVideo: boom"));
    await expect(completeUpload({ projectId: "p1", videoId: "v1", key: "u1/v1/video.mp4" })).rejects.toThrow("boom");
    expect(deleteObjects).toHaveBeenCalledWith(["u1/v1/video.mp4"]);
  });
});

describe("abortUpload", () => {
  it("never deletes an object that already backs a videos row", async () => {
    vi.mocked(deleteObjects).mockClear();
    vi.mocked(getVideoByKey).mockResolvedValue({ id: "v1" });
    await abortUpload({ key: "u1/v1/video.mp4" });
    expect(deleteObjects).not.toHaveBeenCalled();
  });
  it("falls back to deleting the object when the multipart upload was already completed", async () => {
    vi.mocked(deleteObjects).mockClear();
    vi.mocked(getVideoByKey).mockResolvedValue(null);
    const err = Object.assign(new Error("gone"), { name: "NoSuchUpload" });
    vi.mocked(abortMultipart).mockRejectedValue(err);
    await abortUpload({ key: "u1/v1/video.mp4", uploadId: "up1" });
    expect(deleteObjects).toHaveBeenCalledWith(["u1/v1/video.mp4"]);
  });
});
