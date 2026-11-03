import { describe, expect, it } from "vitest";
import { parseYouTubeUrl } from "@/lib/videos/youtube";

describe("parseYouTubeUrl", () => {
  it("accepts watch URLs", () => {
    expect(parseYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s")).toEqual({
      id: "dQw4w9WgXcQ",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
  });
  it("accepts short youtu.be links", () => {
    expect(parseYouTubeUrl("https://youtu.be/dQw4w9WgXcQ?si=abc")?.id).toBe("dQw4w9WgXcQ");
  });
  it("accepts shorts and live URLs", () => {
    expect(parseYouTubeUrl("https://youtube.com/shorts/dQw4w9WgXcQ")?.id).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeUrl("https://www.youtube.com/live/dQw4w9WgXcQ")?.id).toBe("dQw4w9WgXcQ");
  });
  it("rejects anything else", () => {
    expect(parseYouTubeUrl("https://vimeo.com/123")).toBeNull();
    expect(parseYouTubeUrl("not a url")).toBeNull();
    expect(parseYouTubeUrl("https://www.youtube.com/watch?v=short")).toBeNull();
  });
});
