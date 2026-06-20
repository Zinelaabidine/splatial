"use client";

import DashboardSceneCard from "@/components/splatworks/DashboardSceneCard";
import { usePageSearch } from "@/components/layout/AppShellContext";
import { useScenesDashboardGrid } from "@/hooks/scenes/useScenesDashboardGrid";

export default function ScenesDashboardView() {
  const { search, setSearch } = usePageSearch("Search scenes");
  const { scenes, openScene } = useScenesDashboardGrid(search, setSearch);

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <h1 className="mb-6 text-xl font-bold tracking-tight text-white sm:text-2xl">
        Splatworks: Scenes
      </h1>

      {scenes.length === 0 ? (
        <p className="py-16 text-center text-sm text-[#909090]">
          No scenes match your search.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {scenes.map((scene) => (
            <DashboardSceneCard
              key={scene.id}
              scene={scene}
              onClick={openScene}
            />
          ))}
        </div>
      )}
    </div>
  );
}
