"use client";

import GaussianViewerView from "@/components/features/viewer/GaussianViewerView";
import { useSceneViewUrl } from "@/hooks/viewer/useSceneViewUrl";

type GaussianViewerProps = {
  sceneId: string;
};

/** Thin coordinator: resolves the presigned view URL and renders the viewer. */
export default function GaussianViewer({ sceneId }: GaussianViewerProps) {
  const { splatUrl, error, loading } = useSceneViewUrl(sceneId);
  return (
    <GaussianViewerView
      splatUrl={splatUrl}
      error={error}
      loading={loading}
    />
  );
}
