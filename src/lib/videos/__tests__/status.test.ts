import { describe, expect, it } from "vitest";
import { describeVideo } from "@/lib/videos/status";

const base = { error_message: null, highlight_reel_path: null, source_deleted_at: null };

describe("describeVideo", () => {
  it("no video", () => {
    const v = describeVideo(null);
    expect(v).toMatchObject({ label: "No video", tone: "neutral", canPublish: false, canCut: false, canReprocess: false });
  });
  it("uploaded is queued", () => {
    expect(describeVideo({ ...base, status: "uploaded" })).toMatchObject({ label: "Queued", tone: "progress", canPublish: false });
  });
  it("processing can be restarted in case the worker died mid-job", () => {
    expect(describeVideo({ ...base, status: "processing" })).toMatchObject({ label: "Processing", tone: "progress", canPublish: false, canReprocess: true });
  });
  it("done with reel is ready and publishable, cuttable, reprocessable", () => {
    const v = describeVideo({ ...base, status: "done", highlight_reel_path: "v1/highlight_reel.mp4" });
    expect(v).toMatchObject({ label: "Ready", tone: "ok", canPublish: true, canCut: true, canReprocess: true });
  });
  it("done with reel but source deleted cannot cut nor reprocess", () => {
    const v = describeVideo({ ...base, status: "done", highlight_reel_path: "v1/highlight_reel.mp4", source_deleted_at: "2026-11-01T00:00:00Z" });
    expect(v).toMatchObject({ canPublish: true, canCut: false, canReprocess: false });
  });
  it("done without reel is rebuilding and not publishable", () => {
    const v = describeVideo({ ...base, status: "done" });
    expect(v).toMatchObject({ label: "Rebuilding highlight reel", tone: "progress", canPublish: false, canCut: true });
  });
  it("error no_audio", () => {
    const v = describeVideo({ ...base, status: "error", error_message: "no_audio" });
    expect(v).toMatchObject({ label: "No usable audio", tone: "error", canPublish: false, canCut: false, canReprocess: true });
  });
  it("other error", () => {
    const v = describeVideo({ ...base, status: "error", error_message: "ffmpeg exploded" });
    expect(v).toMatchObject({ label: "Failed", tone: "error", canReprocess: true });
  });
});

describe("describeVideo worker outcomes without highlights", () => {
  it("no_peaks is a failed state the coach can reprocess", () => {
    const v = describeVideo({ ...base, status: "error", error_message: "no_peaks" });
    expect(v).toMatchObject({ label: "No highlights found", tone: "error", canPublish: false, canCut: false, canReprocess: true });
  });
  it("no_clips (last clip deleted) is a failed state the coach can reprocess", () => {
    const v = describeVideo({ ...base, status: "error", error_message: "no_clips" });
    expect(v).toMatchObject({ label: "No clips left", tone: "error", canPublish: false, canReprocess: true });
  });
});
