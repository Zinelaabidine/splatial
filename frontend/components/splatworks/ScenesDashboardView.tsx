"use client";

import { useEffect, useRef } from "react";
import { ChevronDown, LayoutGrid, List } from "lucide-react";

import DeleteSceneModal from "@/components/features/scenes/DeleteSceneModal";
import EditSceneModal from "@/components/features/scenes/EditSceneModal";
import DashboardSceneCard from "@/components/splatworks/DashboardSceneCard";
import DashboardSceneListRow from "@/components/splatworks/DashboardSceneListRow";
import SceneCardSkeleton from "@/components/splatworks/SceneCardSkeleton";
import { STATUS_LABELS } from "@/components/splatworks/StatusDot";
import { usePageSearch } from "@/components/layout/AppShellContext";
import { useScenesDashboardGrid, STATUS_FILTER_OPTIONS, type StatusFilter } from "@/hooks/scenes/useScenesDashboardGrid";
import { SORT_LABELS } from "@/lib/scenes/sceneMappers";
import { cn } from "@/lib/utils";
import type { DashboardScene } from "@/types/splatworks";
import type { MockScene, SceneCardState, SortOption } from "@/types/dashboard";

const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  all: "All",
  ...STATUS_LABELS,
};

function dashboardSceneToModalScene(scene: DashboardScene): MockScene {
  const state: SceneCardState =
    scene.status === "completed"
      ? "complete"
      : scene.status === "training"
        ? "processing"
        : scene.status === "queued"
          ? "preprocessing"
          : scene.status === "failed"
            ? "failed"
            : scene.apiStatus === "CANCELLED"
              ? "cancelled"
              : scene.apiStatus === "UPLOADED"
                ? "uploaded"
                : "draft";

  const date = scene.caption;
  return {
    id: scene.id,
    sceneId: scene.sceneId ?? scene.id,
    title: scene.title,
    state,
    apiStatus: scene.apiStatus,
    createdAt: date,
    lastModified: date,
  };
}

export default function ScenesDashboardView() {
  const { search } = usePageSearch("Search scenes");
  const {
    scenes,
    totalCount,
    loading,
    error,
    sortBy,
    setSortBy,
    sortOpen,
    setSortOpen,
    sortOptions,
    statusFilter,
    setStatusFilter,
    statusOpen,
    setStatusOpen,
    viewMode,
    setViewMode,
    actionError,
    actionMessage,
    submittingId,
    cancellingId,
    modalCancelling,
    fetchScenes,
    openScene,
    submitScene,
    cancelScene,
    handleCancelFromModal,
    clearActionError,
    clearActionMessage,
    deleteTarget,
    deleting,
    deleteError,
    remove,
    edit,
    editTarget,
    editSaving,
    editError,
    setEditSaving,
    setEditError,
    dismissEditModal,
    handleSceneEdited,
    toggleSceneVisibility,
    visibilityUpdatingId,
    dismissDeleteModal,
    confirmDelete,
  } = useScenesDashboardGrid(search);

  const sortRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sortOpen && !statusOpen) return;
    const handler = (e: MouseEvent) => {
      if (sortOpen && sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
      if (statusOpen && statusRef.current && !statusRef.current.contains(e.target as Node)) {
        setStatusOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [sortOpen, statusOpen, setSortOpen, setStatusOpen]);

  const emptyMessage = search.trim()
    ? "No scenes match your search."
    : statusFilter !== "all"
      ? "No scenes match this status."
      : "No scenes yet. Create one to get started.";

  const gridClassName = "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6";

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight text-white sm:text-xl">
          Scenes
          {!loading && totalCount > 0 ? (
            <span className="ml-1.5 text-[#84848c]">({totalCount})</span>
          ) : null}
        </h1>

        <div className="flex items-center gap-2">
          <div ref={statusRef} className="relative">
            <button
              type="button"
              onClick={() => setStatusOpen((o) => !o)}
              className="flex h-8 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 text-[13px] text-[#e4e4e7] hover:bg-white/10"
            >
              Status: {STATUS_FILTER_LABELS[statusFilter]}
              <ChevronDown className="h-3.5 w-3.5 text-[#84848c]" />
            </button>
            {statusOpen && (
              <div className="sw-glass absolute right-0 top-full z-10 mt-1.5 min-w-[140px] overflow-hidden rounded-lg py-1">
                {STATUS_FILTER_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setStatusFilter(option);
                      setStatusOpen(false);
                    }}
                    className={cn(
                      "block w-full px-3 py-2 text-left text-[13px] transition-colors hover:bg-white/10",
                      option === statusFilter ? "text-white" : "text-[#c7c7cf]",
                    )}
                  >
                    {STATUS_FILTER_LABELS[option]}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div ref={sortRef} className="relative">
            <button
              type="button"
              onClick={() => setSortOpen((o) => !o)}
              className="flex h-8 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 text-[13px] text-[#e4e4e7] hover:bg-white/10"
            >
              Sort: {SORT_LABELS[sortBy]}
              <ChevronDown className="h-3.5 w-3.5 text-[#84848c]" />
            </button>
            {sortOpen && (
              <div className="sw-glass absolute right-0 top-full z-10 mt-1.5 min-w-[120px] overflow-hidden rounded-lg py-1">
                {sortOptions.map((option: SortOption) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setSortBy(option);
                      setSortOpen(false);
                    }}
                    className={cn(
                      "block w-full px-3 py-2 text-left text-[13px] transition-colors hover:bg-white/10",
                      option === sortBy ? "text-white" : "text-[#c7c7cf]",
                    )}
                  >
                    {SORT_LABELS[option]}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex h-8 items-center rounded-md border border-white/10 bg-white/[0.04] p-0.5">
            <button
              type="button"
              aria-label="Grid view"
              aria-pressed={viewMode === "grid"}
              onClick={() => setViewMode("grid")}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded",
                viewMode === "grid" ? "bg-white text-[#0a0a0b]" : "text-[#84848c] hover:text-white",
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="List view"
              aria-pressed={viewMode === "list"}
              onClick={() => setViewMode("list")}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded",
                viewMode === "list" ? "bg-white text-[#0a0a0b]" : "text-[#84848c] hover:text-white",
              )}
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {actionMessage ? (
        <div className="mb-4 rounded-xl border border-emerald-900/50 bg-emerald-950/40 px-5 py-4 text-sm text-emerald-200">
          {actionMessage}{" "}
          <button
            type="button"
            onClick={clearActionMessage}
            className="font-medium underline underline-offset-2 hover:text-emerald-100"
          >
            Dismiss
          </button>
        </div>
      ) : null}

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

      {!error && loading && scenes.length === 0 ? (
        <div className={gridClassName}>
          {Array.from({ length: 6 }).map((_, i) => (
            <SceneCardSkeleton key={i} />
          ))}
        </div>
      ) : !error && !loading && scenes.length === 0 ? (
        <p className="py-16 text-center text-sm text-[#909090]">{emptyMessage}</p>
      ) : !error && scenes.length > 0 ? (
        viewMode === "grid" ? (
          <div className={gridClassName}>
            {scenes.map((scene) => (
              <DashboardSceneCard
                key={scene.id}
                scene={scene}
                onClick={openScene}
                onSubmitScene={submitScene}
                onCancelScene={cancelScene}
                onDeleteScene={remove}
                onEditScene={edit}
                onVisibilityChange={(scene, visibility) => {
                  void toggleSceneVisibility(scene, visibility);
                }}
                submitting={submittingId === scene.sceneId}
                cancelling={cancellingId === scene.sceneId}
                visibilityUpdating={
                  visibilityUpdatingId === (scene.sceneId ?? scene.id)
                }
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {scenes.map((scene) => (
              <DashboardSceneListRow
                key={scene.id}
                scene={scene}
                onClick={openScene}
                onSubmitScene={submitScene}
                onCancelScene={cancelScene}
                onDeleteScene={remove}
                onEditScene={edit}
                submitting={submittingId === scene.sceneId}
                cancelling={cancellingId === scene.sceneId}
              />
            ))}
          </div>
        )
      ) : null}

      {editTarget && (
        <EditSceneModal
          scene={editTarget}
          saving={editSaving}
          error={editError}
          onDismiss={dismissEditModal}
          onSaved={handleSceneEdited}
          onSavingChange={setEditSaving}
          onError={setEditError}
        />
      )}

      {deleteTarget && (
        <DeleteSceneModal
          scene={dashboardSceneToModalScene(deleteTarget)}
          deleting={deleting}
          cancelling={modalCancelling}
          error={deleteError}
          onDismiss={dismissDeleteModal}
          onConfirmDelete={confirmDelete}
          onCancelProcessing={handleCancelFromModal}
        />
      )}
    </div>
  );
}
