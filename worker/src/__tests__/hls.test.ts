import { describe, expect, it } from "vitest";
import { hlsArgs, parseProgress } from "../hls";

describe("hlsArgs", () => {
  const args = hlsArgs("/tmp/in.mp4", "/tmp/out", { encoder: "libx264" });
  const joined = args.join(" ");

  it("produces one 1080p and one 720p rendition from a single input", () => {
    expect(args[args.indexOf("-i") + 1]).toBe("/tmp/in.mp4");
    expect(joined).toContain("scale=-2:'min(1080,ih)'");
    expect(joined).toContain("scale=-2:'min(720,ih)'");
    expect(args[args.indexOf("-var_stream_map") + 1]).toBe("v:0,a:0,name:1080p v:1,a:1,name:720p");
  });

  it("writes single-file byte-range HLS with 6 s segments and keyframes every 6 s", () => {
    expect(joined).toContain("-f hls");
    expect(args[args.indexOf("-hls_time") + 1]).toBe("6");
    expect(args[args.indexOf("-hls_flags") + 1]).toBe("single_file");
    expect(args[args.indexOf("-hls_playlist_type") + 1]).toBe("vod");
    expect(args[args.indexOf("-force_key_frames") + 1]).toBe("expr:gte(t,n_forced*6)");
    expect(args[args.indexOf("-master_pl_name") + 1]).toBe("master.m3u8");
    expect(args[args.indexOf("-hls_segment_filename") + 1]).toBe("/tmp/out/%v/index.ts");
    expect(args[args.length - 1]).toBe("/tmp/out/%v/index.m3u8");
  });

  it("caps bitrates per rendition (6 Mbps / 3 Mbps video, 128k / 96k audio)", () => {
    expect(args[args.indexOf("-maxrate:v:0") + 1]).toBe("6000k");
    expect(args[args.indexOf("-maxrate:v:1") + 1]).toBe("3000k");
    expect(args[args.indexOf("-b:a:0") + 1]).toBe("128k");
    expect(args[args.indexOf("-b:a:1") + 1]).toBe("96k");
  });

  it("uses the requested video encoder for both renditions, with x264-only flags only for libx264", () => {
    expect(args[args.indexOf("-c:v:0") + 1]).toBe("libx264");
    expect(args[args.indexOf("-c:v:1") + 1]).toBe("libx264");
    expect(joined).toContain("-preset:v veryfast");
    const vt = hlsArgs("/tmp/in.mp4", "/tmp/out", { encoder: "h264_videotoolbox" });
    expect(vt[vt.indexOf("-c:v:0") + 1]).toBe("h264_videotoolbox");
    expect(vt.join(" ")).not.toContain("-preset");
    expect(vt.join(" ")).not.toContain("-crf");
  });

  it("reports progress on stdout and never reads stdin", () => {
    expect(args.slice(0, 2)).toEqual(["-nostdin", "-y"]);
    expect(args[args.indexOf("-progress") + 1]).toBe("pipe:1");
  });
});

describe("parseProgress", () => {
  it("maps out_time_us to a percentage of the duration", () => {
    expect(parseProgress("out_time_us=30000000", 120)).toBe(25);
  });
  it("accepts the older out_time_ms key (also microseconds)", () => {
    expect(parseProgress("out_time_ms=60000000", 120)).toBe(50);
  });
  it("clamps to 100 and ignores other lines", () => {
    expect(parseProgress("out_time_us=999000000", 120)).toBe(100);
    expect(parseProgress("frame=12", 120)).toBeNull();
    expect(parseProgress("out_time_us=N/A", 120)).toBeNull();
  });
});
