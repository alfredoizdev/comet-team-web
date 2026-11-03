"use client";

// Minimal YouTube IFrame API wrapper so the clip editor can scrub a match that
// was imported from a link (the full video is not stored in R2).
import { useEffect, useRef } from "react";

export type PlayerHandle = {
  play: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
  currentTime: () => number;
  duration: () => number;
};

type YTPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  mute: () => void;
  unMute: () => void;
  seekTo: (s: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  destroy: () => void;
};
type YTNamespace = {
  Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer;
  PlayerState: { PLAYING: number; PAUSED: number; BUFFERING: number; ENDED: number };
};
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;
function loadApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve(window.YT!);
      };
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    });
  }
  return apiPromise;
}

/** Pixels cropped from the top and bottom of the iframe: hides YouTube's title bar and "Watch on YouTube". */
const CROP = 70;

export function YouTubePlayer({
  videoId,
  onReady,
  onState,
  onTime,
  onClick,
}: {
  videoId: string;
  onReady: (handle: PlayerHandle, duration: number) => void;
  onState: (state: "playing" | "paused" | "buffering" | "ended") => void;
  onTime: (seconds: number) => void;
  onClick?: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onReady, onState, onTime });
  useEffect(() => {
    callbacks.current = { onReady, onState, onTime };
  });

  useEffect(() => {
    let player: YTPlayer | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;
    const mount = document.createElement("div");
    host.appendChild(mount);

    // Warm-up: a muted play/pause right after load replaces YouTube's red play
    // button and title card with the first frame, so our own controls take over.
    let warmingUp = true;

    loadApi().then((YT) => {
      if (cancelled) return;
      player = new YT.Player(mount, {
        videoId,
        width: "100%",
        height: "100%",
        host: "https://www.youtube-nocookie.com",
        playerVars: { controls: 0, rel: 0, modestbranding: 1, playsinline: 1, disablekb: 1 },
        events: {
          onReady: () => {
            const p = player!;
            p.mute();
            p.playVideo();
            callbacks.current.onReady(
              {
                play: () => p.playVideo(),
                pause: () => p.pauseVideo(),
                seek: (s) => p.seekTo(s, true),
                currentTime: () => p.getCurrentTime(),
                duration: () => p.getDuration(),
              },
              p.getDuration(),
            );
            timer = setInterval(() => callbacks.current.onTime(p.getCurrentTime()), 250);
          },
          onStateChange: (e: { data: number }) => {
            const S = YT.PlayerState;
            if (warmingUp) {
              if (e.data === S.PLAYING) {
                warmingUp = false;
                player!.pauseVideo();
                player!.seekTo(0, true);
                player!.unMute();
                callbacks.current.onState("paused");
              }
              return;
            }
            callbacks.current.onState(
              e.data === S.PLAYING ? "playing" : e.data === S.BUFFERING ? "buffering" : e.data === S.ENDED ? "ended" : "paused",
            );
          },
        },
      });
    });

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      player?.destroy();
      mount.remove();
    };
  }, [videoId]);

  return (
    <div className="relative size-full overflow-hidden bg-black">
      <div
        ref={hostRef}
        className="absolute inset-x-0 [&>div]:size-full [&_iframe]:size-full"
        style={{ top: -CROP, height: `calc(100% + ${CROP * 2}px)` }}
      />
      {/* Blocks every click on the iframe (share, "Watch on YouTube") and hands it to our controls. */}
      <div className="absolute inset-0" onClick={onClick} aria-hidden="true" />
    </div>
  );
}
