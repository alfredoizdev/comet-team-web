import { describe, expect, it } from "vitest";
import type { ClipWithPlayer, Project, Video } from "@/lib/db/types";
import { selectPublishable } from "@/lib/videos/public";

const project: Project = { id: "p1", user_id: "u1", title: "Comets", team: "girls", match_date: "2026-10-25", opponent: "Dynamo", created_at: "" };
const video = (over: Partial<Video>): Video => ({
  id: "v1", project_id: "p1", file_path: "u1/v1/video.mp4", status: "done", error_message: null, duration: 100,
  highlight_reel_path: "v1/highlight_reel.mp4", is_published: true, published_at: "2026-10-26", source_deleted_at: null, source_url: null, stage: null, progress: null, reel_stale: false, hls_path: null,
  created_at: "", ...over,
});
const clip = (id: string, score: number, start = 10): ClipWithPlayer => ({ id, video_id: "v1", start_time: start, end_time: start + 15, score, file_path: `v1/clip_${id}.mp4`, player_id: null, player_name: null, created_at: "" });

describe("selectPublishable", () => {
  it("keeps a published, finished video and only its ready clips", () => {
    const out = selectPublishable([{ project, video: video({}), clips: [clip("a", 2.1, 30), clip("b", 0, 5)] }]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "p1", title: "Comets", opponent: "Dynamo", matchDate: "2026-10-25", reelKey: "v1/highlight_reel.mp4", reelRebuilding: false });
    expect(out[0].clips.map((c) => c.id)).toEqual(["a"]);
  });
  it("marks a published video with a missing reel as rebuilding", () => {
    const out = selectPublishable([{ project, video: video({ highlight_reel_path: null }), clips: [clip("a", 2)] }]);
    expect(out[0]).toMatchObject({ reelKey: null, reelRebuilding: true });
  });
  it("drops videos that are not done", () => {
    expect(selectPublishable([{ project, video: video({ status: "error" }), clips: [] }])).toEqual([]);
  });
  it("drops unpublished videos", () => {
    expect(selectPublishable([{ project, video: video({ is_published: false }), clips: [] }])).toEqual([]);
  });
});

describe("selectPublishable · fullMatch", () => {
  it("points a YouTube match at its YouTube id", () => {
    const out = selectPublishable([{ project, video: video({ source_url: "https://www.youtube.com/watch?v=abc123XYZ_-" }), clips: [clip("a", 2)] }]);
    expect(out[0].fullMatch).toEqual({ kind: "youtube", id: "abc123XYZ_-", watchUrl: "https://www.youtube.com/watch?v=abc123XYZ_-" });
  });
  it("points an uploaded match with a streaming copy at the app's HLS playlist", () => {
    const out = selectPublishable([{ project, video: video({ hls_path: "v1/hls" }), clips: [clip("a", 2)] }]);
    expect(out[0].fullMatch).toEqual({ kind: "hls", url: "/api/hls/v1/master.m3u8" });
  });
  it("has no full match while the streaming copy is not ready", () => {
    const out = selectPublishable([{ project, video: video({ hls_path: null }), clips: [clip("a", 2)] }]);
    expect(out[0].fullMatch).toBeNull();
  });
});

describe("selectPublishable · durations for the match page", () => {
  it("sums the ready clips into reelSeconds and exposes the full match length", () => {
    const out = selectPublishable([{ project, video: video({ duration: 1620.4 }), clips: [clip("a", 2, 10), clip("b", 1, 100), clip("c", 0, 200)] }]);
    expect(out[0].reelSeconds).toBe(30);
    expect(out[0].fullMatchSeconds).toBe(1620.4);
    expect(out[0].clips[0]).toMatchObject({ startTime: 10, endTime: 25 });
  });
  it("keeps the YouTube watch URL so the page can link to it", () => {
    const out = selectPublishable([{ project, video: video({ source_url: "https://youtu.be/abc123XYZ_-" }), clips: [clip("a", 2)] }]);
    expect(out[0].fullMatch).toEqual({ kind: "youtube", id: "abc123XYZ_-", watchUrl: "https://www.youtube.com/watch?v=abc123XYZ_-" });
  });
});
