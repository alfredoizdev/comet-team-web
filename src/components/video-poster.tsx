"use client";

import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

type Props = React.ComponentProps<"video"> & { skeletonClassName?: string };

/** A <video> that shows a skeleton until its first frame (or metadata) is ready. */
export function VideoPoster({ className, skeletonClassName, ...props }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // The element may have loaded before hydration attached any listener.
    if (el.readyState >= 1) {
      setReady(true);
      return;
    }
    const done = () => setReady(true);
    el.addEventListener("loadedmetadata", done);
    el.addEventListener("loadeddata", done);
    el.addEventListener("canplay", done);
    el.addEventListener("error", done);
    // Never leave a skeleton stuck (e.g. preload blocked on mobile data).
    const timer = setTimeout(done, 3000);
    return () => {
      el.removeEventListener("loadedmetadata", done);
      el.removeEventListener("loadeddata", done);
      el.removeEventListener("canplay", done);
      el.removeEventListener("error", done);
      clearTimeout(timer);
    };
  }, []);

  return (
    <>
      {!ready ? <Skeleton className={`absolute inset-0 rounded-none ${skeletonClassName ?? ""}`} /> : null}
      <video ref={ref} {...props} className={`${className ?? ""} transition-opacity duration-300 ${ready ? "opacity-100" : "opacity-0"}`} />
    </>
  );
}
