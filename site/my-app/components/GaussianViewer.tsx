"use client";

import { useEffect, useRef, useState } from "react";
import { authenticatedFetch } from "@/utils/apiClient";
import type { ViewUrlResponse } from "@/types/api";

interface GaussianViewerProps {
  sceneId: string;
}

export default function GaussianViewer({ sceneId }: GaussianViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!containerRef.current) return;

    let viewer: { dispose?: () => void } | null = null;
    let cancelled = false;

    const init = async () => {
      try {
        // Fetch a presigned URL for the PLY file.
        const { url } = (await authenticatedFetch(
          `/api/v1/scenes/${sceneId}/view-url`
        )) as ViewUrlResponse;

        if (cancelled) return;

        // Dynamic import so the library (which references `window`) never
        // runs during SSR.
        const GaussianSplats3D = await import("@mkkellogg/gaussian-splats-3d");

        if (cancelled || !containerRef.current) return;

        setLoading(false);

        const instance = new GaussianSplats3D.Viewer({
          el: containerRef.current,
          cameraUp: [0, -1, 0],
          initialCameraPosition: [-1, -4, 6],
          initialCameraLookAt: [0, 4, 0],
          selfDrivenMode: true,
        });

        viewer = instance;

        await instance.addSplatScene(url, {
          splatAlphaRemovalThreshold: 5,
          showLoadingUI: true,
        });

        instance.start();
      } catch (err) {
        if (!cancelled) {
          console.error("[GaussianViewer] failed to load scene", err);
          setError("Failed to load the 3D scene. Please try again.");
          setLoading(false);
        }
      }
    };

    init();

    return () => {
      cancelled = true;
      try {
        viewer?.dispose?.();
      } catch {
        // ignore cleanup errors
      }
    };
  }, [sceneId]);

  return (
    <div className="relative h-full w-full bg-black">
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-slate-400">Loading scene…</p>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
