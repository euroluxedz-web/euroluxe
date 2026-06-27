"use client";

import { useEffect, useRef } from "react";

/**
 * Site-wide looping video background.
 *
 * Why a client component:
 *  - iOS Safari sometimes refuses to honor `autoPlay` on the server-rendered HTML,
 *    even when `muted` + `playsInline` are present. Calling `.play()` explicitly
 *    on the client (after mount) guarantees playback starts.
 *  - Also handles the rare case where the browser pauses the video to save power
 *    (e.g. when the tab was backgrounded) — we resume on visibilitychange.
 */
export function VideoBackground() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    // Some browsers (older iOS) need a manual play() call after the metadata loads.
    const tryPlay = () => {
      const p = v.play();
      if (p && typeof p.catch === "function") {
        // Catch the AbortError that fires when play() is interrupted by a
        // second play() call — it's harmless and just noise in the console.
        p.catch(() => {});
      }
    };

    // Try immediately + after metadata is loaded (covers both fast and slow loads)
    tryPlay();
    v.addEventListener("loadedmetadata", tryPlay);
    v.addEventListener("canplay", tryPlay);

    // Resume playback when the user comes back to the tab
    const onVisibility = () => {
      if (document.visibilityState === "visible") tryPlay();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      v.removeEventListener("loadedmetadata", tryPlay);
      v.removeEventListener("canplay", tryPlay);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div className="site-video-bg" aria-hidden="true">
      <video
        ref={videoRef}
        autoPlay
        loop
        muted
        playsInline
        // @ts-expect-error - non-standard but widely supported on iOS Safari
        webkit-playsinline="true"
        preload="auto"
        poster="/logo.png"
        className="site-video-bg__video"
      >
        <source src="/background.mp4" type="video/mp4" />
      </video>
      <div className="site-video-bg__overlay" />
    </div>
  );
}
