import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { findTopPeaks, analyzeAudio, hasUsefulAudio, type Peak } from "../audio";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

/* ── helpers ── */
function makePeak(overrides: Partial<Peak> & { second: number }): Peak {
  return { rms: 1000, spike: 2.0, zcr: 0.25, score: 3.0, ...overrides };
}

/** Generate random noise (simulates crowd/ambient sound with high ZCR) */
function fillNoise(samples: Int16Array, start: number, end: number, amplitude: number) {
  for (let i = start; i < end; i++) {
    samples[i] = Math.round((Math.random() - 0.5) * 2 * amplitude);
  }
}

/** Generate sine wave (simulates wind/low ZCR signal) */
function fillSine(samples: Int16Array, start: number, end: number, amplitude: number, freq = 100) {
  for (let i = start; i < end; i++) {
    samples[i] = Math.round(amplitude * Math.sin((2 * Math.PI * freq * (i - start)) / 8000));
  }
}

// Current thresholds: MIN_SCORE=1.5, MIN_RMS=150, MAX_CLIPS=12, MIN_GAP=20s

describe("findTopPeaks", () => {
  it("selects peaks with high score above MIN_RMS (150)", () => {
    const peaks = [
      makePeak({ second: 10, rms: 1000, score: 3.0 }),
      makePeak({ second: 40, rms: 100, score: 5.0 }),  // below RMS floor (150)
      makePeak({ second: 70, rms: 800, score: 2.0 }),
    ];
    const result = findTopPeaks(peaks);
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.second)).toEqual([10, 70]);
  });

  it("rejects peaks with score below MIN_SCORE (1.5)", () => {
    const peaks = [
      makePeak({ second: 10, score: 1.0 }),
      makePeak({ second: 50, score: 2.0 }),
    ];
    const result = findTopPeaks(peaks);
    expect(result).toHaveLength(1);
    expect(result[0].second).toBe(50);
  });

  it("filters out peaks too close together (within 20s)", () => {
    const peaks = [
      makePeak({ second: 10, score: 4.0 }),
      makePeak({ second: 25, score: 3.5 }), // 15s gap — too close (< 20s)
      makePeak({ second: 40, score: 2.0 }), // 30s from first — ok
    ];
    const result = findTopPeaks(peaks);
    expect(result).toHaveLength(2);
    expect(result[0].second).toBe(10);
    expect(result[1].second).toBe(40);
  });

  it("keeps peak at exactly 20s gap", () => {
    const peaks = [makePeak({ second: 10, score: 3.0 }), makePeak({ second: 30, score: 2.0 })];
    expect(findTopPeaks(peaks)).toHaveLength(2);
  });

  it("rejects peak at 19s gap", () => {
    const peaks = [makePeak({ second: 10, score: 3.0 }), makePeak({ second: 29, score: 2.0 })];
    expect(findTopPeaks(peaks)).toHaveLength(1);
  });

  it("limits to MAX_CLIPS (12)", () => {
    const peaks = Array.from({ length: 30 }, (_, i) =>
      makePeak({ second: i * 25, score: 3.0 + i * 0.1 })
    );
    expect(findTopPeaks(peaks)).toHaveLength(12);
  });

  it("returns empty for empty input", () => {
    expect(findTopPeaks([])).toHaveLength(0);
  });

  it("returns chronological order regardless of score order", () => {
    const peaks = [
      makePeak({ second: 90, score: 2.0 }),
      makePeak({ second: 10, score: 5.0 }),
      makePeak({ second: 50, score: 3.0 }),
    ];
    const result = findTopPeaks(peaks);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].second).toBeGreaterThan(result[i - 1].second);
    }
  });

  it("selects highest score when peaks compete within gap", () => {
    const peaks = [
      makePeak({ second: 10, score: 2.0 }),
      makePeak({ second: 15, score: 5.0 }), // higher score wins
      makePeak({ second: 20, score: 3.0 }),
    ];
    const result = findTopPeaks(peaks);
    expect(result).toHaveLength(1);
    expect(result[0].second).toBe(15); // highest score selected
  });
});

describe("analyzeAudio", () => {
  const tmpDir = join("/tmp", "peakclip-test");

  beforeEach(() => { mkdirSync(tmpDir, { recursive: true }); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  function writeRaw(name: string, samples: Int16Array) {
    const path = join(tmpDir, name);
    writeFileSync(path, Buffer.from(samples.buffer));
    return path;
  }

  it("silent file has zero RMS", () => {
    const path = writeRaw("silence.raw", new Int16Array(8000 * 3));
    const peaks = analyzeAudio(path, 8000);
    expect(peaks).toHaveLength(3);
    expect(peaks[0].rms).toBe(0);
    expect(peaks[0].score).toBe(0);
  });

  it("handles empty file", () => {
    writeFileSync(join(tmpDir, "e.raw"), Buffer.alloc(0));
    expect(analyzeAudio(join(tmpDir, "e.raw"), 8000)).toHaveLength(0);
  });

  it("handles partial last window", () => {
    const samples = new Int16Array(8000 + 4000);
    fillNoise(samples, 0, 12000, 1000);
    const path = writeRaw("partial.raw", samples);
    const peaks = analyzeAudio(path, 8000);
    // 1 full window + 1 partial window
    expect(peaks.length).toBeGreaterThanOrEqual(1);
    expect(peaks.length).toBeLessThanOrEqual(2);
  });

  it("crowd burst in quiet ambient gets high score", () => {
    const sampleRate = 8000;
    const samples = new Int16Array(sampleRate * 20);
    fillNoise(samples, 0, sampleRate * 20, 200); // quiet ambient
    fillNoise(samples, sampleRate * 8, sampleRate * 16, 5000); // 8s crowd burst

    const path = writeRaw("crowd-burst.raw", samples);
    const peaks = analyzeAudio(path, sampleRate);

    const crowdScore = Math.max(...peaks.slice(8, 16).map(p => p.score));
    const quietScore = peaks[0].score;
    expect(crowdScore).toBeGreaterThan(quietScore);
    expect(crowdScore).toBeGreaterThan(1.5);
  });

  it("sustained crowd reaction scores higher than isolated shout", () => {
    const sampleRate = 8000;
    const samples = new Int16Array(sampleRate * 40);
    fillNoise(samples, 0, sampleRate * 40, 200); // quiet baseline

    // Second 5: isolated 1s shout
    fillNoise(samples, sampleRate * 5, sampleRate * 6, 5000);
    // Seconds 25-33: sustained 8s crowd
    fillNoise(samples, sampleRate * 25, sampleRate * 33, 5000);

    const path = writeRaw("shout-vs-crowd.raw", samples);
    const peaks = analyzeAudio(path, sampleRate);

    const sustainedScore = Math.max(...peaks.slice(25, 33).map(p => p.score));
    const shoutScore = peaks[5].score;
    expect(sustainedScore).toBeGreaterThan(shoutScore);
  });

  it("wind (low ZCR sine wave) scores lower than crowd noise (high ZCR)", () => {
    const sampleRate = 8000;
    const samples = new Int16Array(sampleRate * 40);
    fillNoise(samples, 0, sampleRate * 40, 100); // baseline

    // Second 5-13: wind gust (sine wave = low ZCR)
    fillSine(samples, sampleRate * 5, sampleRate * 13, 5000);
    // Second 25-33: crowd (noise = high ZCR)
    fillNoise(samples, sampleRate * 25, sampleRate * 33, 5000);

    const path = writeRaw("wind-vs-crowd.raw", samples);
    const peaks = analyzeAudio(path, sampleRate);

    const windScore = Math.max(...peaks.slice(5, 13).map(p => p.score));
    const crowdScore = Math.max(...peaks.slice(25, 33).map(p => p.score));
    expect(crowdScore).toBeGreaterThan(windScore);
  });

  it("all peaks have required fields", () => {
    const samples = new Int16Array(8000 * 5);
    fillNoise(samples, 0, 8000 * 5, 1000);
    const path = writeRaw("fields.raw", samples);
    const peaks = analyzeAudio(path, 8000);

    for (const p of peaks) {
      expect(p).toHaveProperty("second");
      expect(p).toHaveProperty("rms");
      expect(p).toHaveProperty("spike");
      expect(p).toHaveProperty("zcr");
      expect(p).toHaveProperty("score");
      expect(typeof p.second).toBe("number");
      expect(typeof p.rms).toBe("number");
      expect(typeof p.score).toBe("number");
    }
  });
});

describe("hasUsefulAudio", () => {
  it("returns false for empty peaks array", () => {
    expect(hasUsefulAudio([])).toBe(false);
  });

  it("returns false for silent audio (low RMS, no scores)", () => {
    const peaks = [
      makePeak({ second: 0, rms: 10, score: 0 }),
      makePeak({ second: 1, rms: 15, score: 0 }),
      makePeak({ second: 2, rms: 5, score: 0.2 }),
    ];
    expect(hasUsefulAudio(peaks)).toBe(false);
  });

  it("returns false for low RMS even with some score", () => {
    const peaks = [
      makePeak({ second: 0, rms: 20, score: 1.5 }),
      makePeak({ second: 1, rms: 30, score: 0.5 }),
    ];
    // avg RMS = 25, below 50 threshold
    expect(hasUsefulAudio(peaks)).toBe(false);
  });

  it("returns true for audio with crowd reactions", () => {
    const peaks = [
      makePeak({ second: 0, rms: 200, score: 0.5 }),
      makePeak({ second: 1, rms: 300, score: 0.3 }),
      makePeak({ second: 10, rms: 2000, score: 3.0 }),
    ];
    expect(hasUsefulAudio(peaks)).toBe(true);
  });

  it("returns false for high RMS but no meaningful scores", () => {
    const peaks = [
      makePeak({ second: 0, rms: 500, score: 0.2 }),
      makePeak({ second: 1, rms: 600, score: 0.5 }),
    ];
    // avg RMS = 550 (above 50) but no score >= 1.0
    expect(hasUsefulAudio(peaks)).toBe(false);
  });
});
