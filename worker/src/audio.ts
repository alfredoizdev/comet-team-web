import { readFileSync } from "fs";

export type Peak = {
  second: number;
  rms: number;
  /** How much louder this window is vs its local baseline */
  spike: number;
  /** Zero-crossing rate — high for crowd/claps, low for wind */
  zcr: number;
  /** Combined score: sustained energy burst weighted by crowd-like texture */
  score: number;
};

/**
 * Analyze audio to detect crowd reactions (goals, celebrations, applause)
 * while ignoring wind and isolated shouts.
 *
 * Three-layer detection:
 * 1. Spike ratio — volume relative to local baseline (rejects constant wind)
 * 2. Burst accumulation — sustained spikes over 10s (rejects isolated shouts)
 * 3. Zero-crossing rate — crowd/claps texture vs smooth wind (rejects wind gusts)
 *
 * Key insight: Real crowd reactions (goals, big plays) have:
 * - High ZCR (>0.18) because many people cheering/clapping creates complex waveforms
 * - Sustained energy (>8 seconds of elevated RMS)
 * Wind gusts and isolated shouts have low ZCR (<0.15) and short duration.
 */
export function analyzeAudio(rawPath: string, sampleRate = 8000): Peak[] {
  const buffer = readFileSync(rawPath);
  const samples = new Int16Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength / 2
  );

  const windowSize = sampleRate; // 1 second per window
  const windows: { second: number; rms: number; zcr: number }[] = [];

  for (let i = 0; i < samples.length; i += windowSize) {
    const end = Math.min(i + windowSize, samples.length);
    let sumSquares = 0;
    let zeroCrossings = 0;

    for (let j = i; j < end; j++) {
      sumSquares += samples[j] * samples[j];
      if (j > i && ((samples[j] >= 0 && samples[j - 1] < 0) || (samples[j] < 0 && samples[j - 1] >= 0))) {
        zeroCrossings++;
      }
    }

    const len = end - i;
    const rms = Math.sqrt(sumSquares / len);
    const zcr = len > 1 ? zeroCrossings / (len - 1) : 0;

    windows.push({ second: i / sampleRate, rms, zcr });
  }

  // Step 1: Spike ratio vs local baseline (±30s median)
  const BASELINE_RADIUS = 30;
  const spiked = windows.map((val, idx) => {
    const start = Math.max(0, idx - BASELINE_RADIUS);
    const end = Math.min(windows.length, idx + BASELINE_RADIUS + 1);
    const neighbors: number[] = [];
    for (let k = start; k < end; k++) {
      if (k !== idx) neighbors.push(windows[k].rms);
    }
    neighbors.sort((a, b) => a - b);
    const baseline = neighbors.length > 0
      ? neighbors[Math.floor(neighbors.length / 2)]
      : 1;
    const spike = baseline > 0 ? val.rms / baseline : 0;
    return { ...val, spike };
  });

  // Step 2: Burst score (sustained elevated energy over 10 seconds)
  // Longer window rewards sustained crowd reactions vs short shouts
  const BURST_WINDOW = 10;
  const bursted = spiked.map((val, idx) => {
    let burst = 0;
    for (let k = idx; k < Math.min(spiked.length, idx + BURST_WINDOW); k++) {
      burst += Math.max(0, spiked[k].spike - 1);
    }
    return { ...val, burst };
  });

  // Step 3: ZCR-based crowd detection + sustained energy scoring
  // Two types of crowd reactions:
  //   A) Applause/cheering: high ZCR (>0.18), rapid zero-crossings
  //   B) Sustained roar/chant: lower ZCR (0.12-0.18) but very sustained energy
  // Wind/isolated shouts: low ZCR (<0.12) AND short duration
  const ZCR_WINDOW = 5;

  const peaks: Peak[] = bursted.map((val, idx) => {
    // Average ZCR in neighborhood
    const zcrStart = Math.max(0, idx - ZCR_WINDOW);
    const zcrEnd = Math.min(windows.length, idx + ZCR_WINDOW + 1);
    let zcrSum = 0;
    for (let k = zcrStart; k < zcrEnd; k++) {
      zcrSum += windows[k].zcr;
    }
    const avgZcr = zcrSum / (zcrEnd - zcrStart);

    // Count sustained seconds with RMS > 400 in a 14s window
    let sustainedCount = 0;
    for (let k = Math.max(0, idx - 2); k < Math.min(windows.length, idx + 12); k++) {
      if (windows[k].rms > 400) sustainedCount++;
    }

    // Check peak RMS in window — very loud sustained moments deserve credit
    // even with low ZCR (opposing team's crowd far from camera)
    let peakRms = 0;
    for (let k = Math.max(0, idx - 2); k < Math.min(windows.length, idx + 12); k++) {
      if (windows[k].rms > peakRms) peakRms = windows[k].rms;
    }

    // ZCR multiplier: soft penalty for low ZCR, boost for high ZCR
    // Sustained loud roars (low ZCR but very high RMS) get partial credit
    let zcrMultiplier: number;
    if (avgZcr < 0.10) {
      // Very low ZCR — likely wind unless VERY loud and sustained
      if (peakRms > 1000 && sustainedCount >= 8) {
        zcrMultiplier = 0.35; // Loud sustained roar — probably opposing goal
      } else {
        zcrMultiplier = 0.1;
      }
    } else if (avgZcr < 0.15) {
      // Low ZCR — could be sustained roar or wind
      if (peakRms > 800 && sustainedCount >= 6) {
        zcrMultiplier = 0.5; // Sustained energy rescues it
      } else {
        const sustainedRescue = Math.min(sustainedCount / 10, 1.0);
        zcrMultiplier = 0.15 + sustainedRescue * 0.35;
      }
    } else if (avgZcr < 0.20) {
      // Medium ZCR — likely crowd, moderate boost
      zcrMultiplier = 0.7 + ((avgZcr - 0.15) / 0.05) * 0.3;
    } else {
      // High ZCR — definite crowd reaction, boost
      zcrMultiplier = 1.0 + (avgZcr - 0.20) * 3;
    }

    // Sustained energy bonus (lowered threshold from 500 to 400 to catch softer reactions)
    const sustainedBonus = Math.min(sustainedCount / 6, 2.0);

    const score = val.burst * zcrMultiplier * sustainedBonus;
    return { second: val.second, rms: val.rms, spike: val.spike, zcr: avgZcr, score };
  });

  return peaks;
}

/**
 * Check if the analyzed audio has enough signal to detect highlights.
 * Returns false if the audio is near-silent or has no crowd-like energy.
 */
export function hasUsefulAudio(peaks: Peak[]): boolean {
  if (peaks.length === 0) return false;

  const avgRms = peaks.reduce((sum, p) => sum + p.rms, 0) / peaks.length;
  const hasAnyScore = peaks.some((p) => p.score >= 1.0);

  return avgRms >= 50 && hasAnyScore;
}

const MIN_SCORE = 1.5;
const MIN_RMS = 150;
const MAX_CLIPS = 12;
const MIN_GAP_SECONDS = 20;

export function findTopPeaks(peaks: Peak[]): Peak[] {
  const sorted = [...peaks]
    .filter((p) => p.score >= MIN_SCORE && p.rms >= MIN_RMS)
    .sort((a, b) => b.score - a.score);

  const selected: Peak[] = [];

  for (const peak of sorted) {
    if (selected.length >= MAX_CLIPS) break;
    const tooClose = selected.some(
      (s) => Math.abs(s.second - peak.second) < MIN_GAP_SECONDS
    );
    if (!tooClose) {
      selected.push(peak);
    }
  }

  return selected.sort((a, b) => a.second - b.second);
}
