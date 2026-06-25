"use client";

import { RefreshCw } from "lucide-react";

import DashboardSceneCard from "@/components/splatworks/DashboardSceneCard";
import { usePageSearch } from "@/components/layout/AppShellContext";
import { useScenesDashboardGrid } from "@/hooks/scenes/useScenesDashboardGrid";

export default function ScenesDashboardView() {
  const { search } = usePageSearch("Search scenes");
  const {
    scenes,
    loading,
    error,
    actionError,
    submittingId,
    fetchScenes,
    openScene,
    submitScene,
    clearActionError,
  } = useScenesDashboardGrid(search);

  const emptyMessage = search.trim()
    ? "No scenes match your search."
    : "No scenes yet. Create one to get started.";

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <h1 className="mb-6 flex items-center gap-3 text-xl font-bold tracking-tight text-white sm:text-2xl">
        Splatworks: Scenes
        {loading && <RefreshCw className="h-5 w-5 animate-spin text-[#909090]" />}
      </h1>

      {error ? (
        <div className="rounded-xl border border-red-900/50 bg-red-950/40 px-5 py-4 text-sm text-red-300">
          {error}{" "}
          <button
            type="button"
            onClick={() => fetchScenes()}
            className="font-medium underline underline-offset-2 hover:text-red-200"
          >
            Retry
          </button>
        </div>
      ) : actionError ? (
        <div className="mb-4 rounded-xl border border-red-900/50 bg-red-950/40 px-5 py-4 text-sm text-red-300">
          {actionError}{" "}
          <button
            type="button"
            onClick={clearActionError}
            className="font-medium underline underline-offset-2 hover:text-red-200"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {!error && !loading && scenes.length === 0 ? (
        <p className="py-16 text-center text-sm text-[#909090]">{emptyMessage}</p>
      ) : !error && scenes.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {scenes.map((scene) => (
            <DashboardSceneCard
              key={scene.id}
              scene={scene}
              onClick={openScene}
              onSubmitScene={submitScene}
              submitting={submittingId === scene.sceneId}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
