"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { authenticatedFetch } from "@/utils/apiClient";
import type { ViewUrlResponse } from "@/types/api";

// LegacySplatViewer references `window` / WebGL — never run on the server.
const LegacySplatViewer = dynamic(
  () => import("@/components/splatviewer/LegacySplatViewer"),
  { ssr: false }
);

interface GaussianViewerProps {
  sceneId: string;
}

export default function GaussianViewer({ sceneId }: GaussianViewerProps) {
  const [splatUrl, setSplatUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const { url } = (await authenticatedFetch(
          `/api/v1/scenes/${sceneId}/view-url`
        )) as ViewUrlResponse;

        if (cancelled) return;
        setSplatUrl(url);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.error("[GaussianViewer] failed to fetch view URL", err);
          setError("Failed to load the 3D scene. Please try again.");
          setLoading(false);
        }
      }
    };

    init();
    return () => { cancelled = true; };
  }, [sceneId]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-black">
        <p className="text-sm text-slate-400">Loading scene…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-black">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  if (!splatUrl) return null;

  return (
    <div className="relative h-full w-full">
      <LegacySplatViewer splatUrl={splatUrl} />
    </div>
  );
}
