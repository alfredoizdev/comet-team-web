"use client";

import { useEffect, useRef, type RefObject } from "react";

export function isHlsUrl(src: string): boolean {
  return /\.m3u8(\?|$)/.test(src);
}

/**
 * Feeds `src` to the video element: an HLS playlist natively where the browser
 * supports it (Safari, iOS) or through hls.js elsewhere; any other URL directly.
 */
export function useHls(ref: RefObject<HTMLVideoElement | null>, src: string, remountKey: unknown = null): void {
  // `remountKey`: pass a value that changes whenever the <video> element is re-created
  // (e.g. a layout toggle), so the source is attached to the new element.
  useEffect(() => {
    const el = ref.current;
    if (!el || !src) return;
    const detach = () => {
      el.removeAttribute("src");
      el.load();
    };
    if (!isHlsUrl(src) || el.canPlayType("application/vnd.apple.mpegurl")) {
      el.src = src;
      return detach;
    }
    let hls: import("hls.js").default | null = null;
    let cancelled = false;
    import("hls.js").then(({ default: Hls }) => {
      if (cancelled) return;
      if (!Hls.isSupported()) {
        el.src = src;
        return;
      }
      hls = new Hls();
      hls.loadSource(src);
      hls.attachMedia(el);
    });
    return () => {
      cancelled = true;
      hls?.destroy();
      detach();
    };
  }, [ref, src, remountKey]);
}

type Props = Omit<React.ComponentProps<"video">, "src"> & { src: string };

/** A <video> that plays an HLS playlist (or a plain file) on every browser. */
export function HlsVideo({ src, ...props }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  useHls(ref, src);
  return <video ref={ref} {...props} />;
}
