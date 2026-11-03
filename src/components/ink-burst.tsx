"use client";

import { useEffect, useRef } from "react";

/*
 * Ink burst for the split home page. When the pointer moves onto one half, a
 * single burst of ink in the OTHER half's colour pours out from underneath the
 * crest and drifts across the hovered half like dry leaves in the wind: a short
 * gust outward, then a slow sway, a gentle sink and a continuous tumble, fading
 * out over the last part of each particle's life. Pure 2D canvas, one burst per
 * side change, disabled on touch / small screens / reduced motion.
 */

const PINK_INK = ["#ff2d8a", "#ff5ca8", "#ff8fc2"] as const;
const NAVY_INK = ["#0b1f4b", "#1c3a7a", "#3b5aa0"] as const;

const MIN_PARTICLES = 110;
const MAX_PARTICLES = 150;
const MIN_LIFE_MS = 2500;
const MAX_LIFE_MS = 4000;
const MIN_SIZE = 4;
const MAX_SIZE = 28;
/** Gust velocity decays with this time constant (s): ~95% gone after 1 s. */
const GUST_TAU = 0.33;
/** The downward "leaf" sink ramps up to its terminal speed over this time (s). */
const SINK_TAU = 0.8;
/** Fraction of the lifetime after which the particle starts fading. */
const FADE_FROM = 0.6;
const FLUTTER = 0.15;

type Shape = "circle" | "drop" | "blob";

type Particle = {
  /** Start point on the crest circumference (CSS px, canvas space). */
  ox: number;
  oy: number;
  /** Unit outward direction (radial from the crest centre). */
  dirX: number;
  dirY: number;
  /** Total gust displacement (px) = v0 * GUST_TAU. */
  gust: number;
  /** Slow steady wind along the outward direction (px/s). */
  wind: number;
  /** Terminal sink speed (px/s). */
  sink: number;
  swayAmp: number;
  swayW: number;
  swayPhase: number;
  flutterW: number;
  flutterPhase: number;
  rot0: number;
  /** Tumble rate (rad/s), 0 for circles. */
  spin: number;
  /** Half size (px); the path is built with unit radius. */
  radius: number;
  color: string;
  path: Path2D;
  born: number;
  life: number;
};

type Burst = {
  particles: Particle[];
  /** Element whose bounding rect clips the drawing. */
  clipTo: HTMLElement;
};

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

const CIRCLE_PATH = typeof Path2D === "function" ? new Path2D() : null;
CIRCLE_PATH?.arc(0, 0, 1, 0, Math.PI * 2);

/** Unit-radius path for a shape; scaled per frame with the canvas transform. */
function makePath(shape: Shape): Path2D {
  if (shape === "circle" && CIRCLE_PATH) return CIRCLE_PATH;
  const path = new Path2D();
  if (shape === "circle") {
    path.arc(0, 0, 1, 0, Math.PI * 2);
  } else if (shape === "drop") {
    // Elongated drip: long along its own x axis, squashed on y.
    path.ellipse(0, 0, rand(1.6, 2.8), 0.62, 0, 0, Math.PI * 2);
  } else {
    // Irregular blob: 6–9 radii jittered ±35%, smoothed through the midpoints.
    const n = 6 + Math.floor(Math.random() * 4);
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const k = rand(0.65, 1.35);
      xs.push(Math.cos(a) * k);
      ys.push(Math.sin(a) * k);
    }
    path.moveTo((xs[n - 1] + xs[0]) / 2, (ys[n - 1] + ys[0]) / 2);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      path.quadraticCurveTo(xs[i], ys[i], (xs[i] + xs[j]) / 2, (ys[i] + ys[j]) / 2);
    }
    path.closePath();
  }
  return path;
}

function makeParticle(
  cx: number,
  cy: number,
  crestRadius: number,
  direction: 1 | -1,
  palette: readonly string[],
  now: number
): Particle {
  // Random point on the half of the crest circle facing the hovered side,
  // moving radially outward from under the crest edge.
  const theta = rand(-Math.PI / 2, Math.PI / 2);
  const dirX = Math.cos(theta) * direction;
  const dirY = Math.sin(theta);
  const roll = Math.random();
  const shape: Shape = roll < 0.4 ? "circle" : roll < 0.7 ? "drop" : "blob";
  // Bias toward small particles with a few big splats; small ones fly further.
  const size = MIN_SIZE + (MAX_SIZE - MIN_SIZE) * Math.random() ** 1.8;
  const lightness = 1.2 - size / MAX_SIZE; // 1.05 (small) … 0.2 (big)
  const spinMax = shape === "blob" ? 2.4 : 1.2;

  return {
    ox: cx + dirX * crestRadius,
    oy: cy + dirY * crestRadius,
    dirX,
    dirY,
    gust: rand(60, 260) * (0.6 + lightness * 0.5),
    wind: rand(10, 40) * (0.5 + lightness * 0.6),
    sink: rand(18, 48) * (0.6 + (1 - lightness) * 0.5),
    swayAmp: rand(10, 36),
    swayW: rand(0.25, 0.6) * Math.PI * 2,
    swayPhase: rand(0, Math.PI * 2),
    flutterW: rand(0.8, 2.2) * Math.PI * 2,
    flutterPhase: rand(0, Math.PI * 2),
    rot0: shape === "drop" ? Math.atan2(dirY, dirX) : rand(0, Math.PI * 2),
    spin: shape === "circle" ? 0 : rand(0.4, spinMax) * (Math.random() < 0.5 ? -1 : 1),
    radius: size / 2,
    color: pick(palette),
    path: makePath(shape),
    born: now,
    life: rand(MIN_LIFE_MS, MAX_LIFE_MS),
  };
}

export function InkBurst() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const girls = host.querySelector<HTMLElement>(".split-girls");
    const boys = host.querySelector<HTMLElement>(".split-boys");
    const crest = host.querySelector<HTMLElement>(".split-crest");
    if (!girls || !boys || !crest) return;

    const hoverMq = window.matchMedia("(hover: hover) and (min-width: 48rem)");
    const motionMq = window.matchMedia("(prefers-reduced-motion: no-preference)");

    let dpr = 1;
    const bursts: Burst[] = [];
    let raf = 0;
    let listening = false;
    /** The half the pointer is currently known to be over, null if unknown. */
    let lastSide: HTMLElement | null = null;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { width, height } = host.getBoundingClientRect();
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };

    const clear = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };

    const frame = () => {
      const now = performance.now();
      clear();
      const hostRect = host.getBoundingClientRect();
      ctx.globalCompositeOperation = "source-over";

      let liveBursts = 0;
      for (let b = 0; b < bursts.length; b++) {
        const burst = bursts[b];
        const parts = burst.particles;
        const r = burst.clipTo.getBoundingClientRect();

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.save();
        ctx.beginPath();
        ctx.rect(r.left - hostRect.left, r.top - hostRect.top, r.width, r.height);
        ctx.clip();

        let w = 0;
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i];
          const ageMs = now - p.born;
          if (ageMs >= p.life) continue;
          parts[w++] = p;

          const a = Math.max(0, ageMs) / 1000;
          const f = ageMs / p.life;
          const gustDisp = p.gust * (1 - Math.exp(-a / GUST_TAU));
          const sinkDisp = p.sink * (a - SINK_TAU * (1 - Math.exp(-a / SINK_TAU)));
          const sway = p.swayAmp * Math.sin(p.swayW * a + p.swayPhase) * Math.min(1, a);
          const x = p.ox + p.dirX * (gustDisp + p.wind * a) + sway;
          const y = p.oy + p.dirY * gustDisp + sinkDisp;
          const scale = p.radius * (1 + FLUTTER * Math.sin(p.flutterW * a + p.flutterPhase)) * dpr;
          const rot = p.rot0 + p.spin * a;
          const c = Math.cos(rot) * scale;
          const s = Math.sin(rot) * scale;

          ctx.setTransform(c, s, -s, c, x * dpr, y * dpr);
          ctx.globalAlpha = f < FADE_FROM ? 1 : 1 - (f - FADE_FROM) / (1 - FADE_FROM);
          ctx.fillStyle = p.color;
          ctx.fill(p.path);
        }
        parts.length = w;
        ctx.restore();

        if (w > 0) bursts[liveBursts++] = burst;
      }
      bursts.length = liveBursts;

      raf = liveBursts > 0 ? requestAnimationFrame(frame) : 0;
    };

    const burst = (side: HTMLElement) => {
      const hostRect = host.getBoundingClientRect();
      const crestRect = crest.getBoundingClientRect();
      const intoNavy = side === boys;
      const cx = crestRect.left + crestRect.width / 2 - hostRect.left;
      const cy = crestRect.top + crestRect.height / 2 - hostRect.top;
      const crestRadius = crestRect.width / 2;
      const direction: 1 | -1 = intoNavy ? 1 : -1;
      const palette = intoNavy ? PINK_INK : NAVY_INK;
      const now = performance.now();
      const count = Math.round(rand(MIN_PARTICLES, MAX_PARTICLES));
      const particles: Particle[] = [];
      for (let i = 0; i < count; i++) {
        particles.push(makeParticle(cx, cy, crestRadius, direction, palette, now));
      }
      bursts.push({ particles, clipTo: side });
      if (!raf) raf = requestAnimationFrame(frame);
    };

    /** Fire when the pointer's side changes, whichever event told us about it. */
    const enterSide = (side: HTMLElement) => {
      if (side === lastSide) return;
      lastSide = side;
      burst(side);
    };
    const onGirlsEnter = () => enterSide(girls);
    const onBoysEnter = () => enterSide(boys);
    // `mouseenter` only fires on a boundary crossing. If the pointer is already
    // resting over a half when the user starts moving (returning from another
    // tab or app, window focus changes, a missed mouseleave after leaving the
    // window, moving before hydration) it never fires, so we also derive the
    // side from every mousemove's hit-tested target.
    const onMove = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target.closest<HTMLElement>(".split-side") : null;
      if (target === girls || target === boys) enterSide(target);
    };
    const forget = () => {
      lastSide = null;
    };

    const ro = new ResizeObserver(resize);

    const start = () => {
      if (listening) return;
      listening = true;
      resize();
      ro.observe(host);
      girls.addEventListener("mouseenter", onGirlsEnter);
      boys.addEventListener("mouseenter", onBoysEnter);
      host.addEventListener("mousemove", onMove);
      host.addEventListener("mouseleave", forget);
      window.addEventListener("blur", forget);
      document.addEventListener("visibilitychange", forget);
    };

    const stop = () => {
      if (!listening) return;
      listening = false;
      ro.disconnect();
      girls.removeEventListener("mouseenter", onGirlsEnter);
      boys.removeEventListener("mouseenter", onBoysEnter);
      host.removeEventListener("mousemove", onMove);
      host.removeEventListener("mouseleave", forget);
      window.removeEventListener("blur", forget);
      document.removeEventListener("visibilitychange", forget);
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      bursts.length = 0;
      lastSide = null;
      clear();
    };

    const sync = () => {
      if (hoverMq.matches && motionMq.matches) start();
      else stop();
    };

    sync();
    hoverMq.addEventListener("change", sync);
    motionMq.addEventListener("change", sync);

    return () => {
      hoverMq.removeEventListener("change", sync);
      motionMq.removeEventListener("change", sync);
      stop();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 hidden md:block"
    />
  );
}
