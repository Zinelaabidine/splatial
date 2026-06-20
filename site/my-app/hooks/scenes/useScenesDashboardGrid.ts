"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";

import { MOCK_DASHBOARD_SCENES } from "@/fixtures/mockDashboardScenes";
import type { DashboardScene } from "@/types/splatworks";

export function useScenesDashboardGrid(
  search: string,
  _setSearch: (value: string) => void,
) {
  const router = useRouter();

  const scenes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return MOCK_DASHBOARD_SCENES;
    return MOCK_DASHBOARD_SCENES.filter((s) =>
      s.title.toLowerCase().includes(q),
    );
  }, [search]);

  const openScene = (scene: DashboardScene) => {
    if (scene.status === "completed" && scene.sceneId) {
      router.push(`/scenes/view?id=${scene.sceneId}`);
      return;
    }
    if (scene.status === "draft") {
      // TODO: open scene editor (upload / reorder / submit)
      router.push("/scenes/create");
      return;
    }
    // TODO: scene detail with live training progress
    console.info("[Splatworks] Scene detail not implemented", scene.id);
  };

  const createScene = () => {
    router.push("/scenes/create");
  };

  return {
    scenes,
    openScene,
    createScene,
  };
}
