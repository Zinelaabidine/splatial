"use client";

import { useEffect, useMemo, useRef } from "react";

import DeleteSceneModal from "@/components/features/scenes/DeleteSceneModal";
import EditSceneModal from "@/components/features/scenes/EditSceneModal";
import DashboardSceneCard from "@/components/splatworks/DashboardSceneCard";
import DashboardSceneListRow from "@/components/splatworks/DashboardSceneListRow";
import SceneCardSkeleton from "@/components/splatworks/SceneCardSkeleton";
import DashboardToolbar from "@/components/splatworks/dashboard/DashboardToolbar";
import { usePageSearch } from "@/components/layout/AppShellContext";
import {
  useScenesDashboardGrid,
  STATUS_FILTER_OPTIONS,
  type StatusFilter,
} from "@/hooks/scenes/useScenesDashboardGrid";
import { computeDashboardStats } from "@/lib/scenes/featuredScene";
import type { DashboardScene } from "@/types/splatworks";
import type { MockScene, SceneCardState } from "@/types/dashboard";

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

const GRID_CLASS =
  "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5";

export default function ScenesDashboardView() {
  const { search } = usePageSearch("Search");
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

  const stats = useMemo(() => computeDashboardStats(scenes), [scenes]);

  const emptyMessage = search.trim()
    ? "No scenes match your search."
    : statusFilter !== "all"
      ? "No scenes match this status."
      : "No scenes yet. Create one to get started.";

  const cardProps = (scene: DashboardScene, density: "default" | "compact" = "default") => ({
    scene,
    density,
    onClick: openScene,
    onSubmitScene: submitScene,
    onCancelScene: cancelScene,
    onDeleteScene: remove,
    onEditScene: edit,
    onVisibilityChange: (
      s: DashboardScene,
      visibility: Parameters<typeof toggleSceneVisibility>[1],
    ) => {
      void toggleSceneVisibility(s, visibility);
    },
    submitting: submittingId === scene.sceneId,
    cancelling: cancellingId === scene.sceneId,
    visibilityUpdating: visibilityUpdatingId === (scene.sceneId ?? scene.id),
  });

  return (
    <div className="sw-content-surface w-full rounded-2xl px-4 py-5 sm:px-5">
      <header className="mb-5 border-b border-white/6 pb-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
              Your Scenes
            </h1>
            <p className="mt-1 text-sm text-[#a8a8b2]">
              Browse, manage, and publish your Gaussian Splatting work.
            </p>

            {!loading && totalCount > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="sw-dash-stat">
                  <strong>{stats.total}</strong> scenes
                </span>
                {stats.ready > 0 && (
                  <span className="sw-dash-stat">
                    <strong>{stats.ready}</strong> ready
                  </span>
                )}
                {stats.trainingNow > 0 && (
                  <span className="sw-dash-stat">
                    <strong>{stats.trainingNow}</strong> in progress
                  </span>
                )}
                {stats.publicCount > 0 && (
                  <span className="sw-dash-stat">
                    <strong>{stats.publicCount}</strong> public
                  </span>
                )}
              </div>
            )}
          </div>

          <DashboardToolbar
            statusFilter={statusFilter}
            statusOpen={statusOpen}
            onStatusToggle={() => setStatusOpen((o) => !o)}
            onStatusSelect={(filter) => {
              setStatusFilter(filter);
              setStatusOpen(false);
            }}
            statusOptions={STATUS_FILTER_OPTIONS}
            statusRef={statusRef}
            sortBy={sortBy}
            sortOpen={sortOpen}
            onSortToggle={() => setSortOpen((o) => !o)}
            onSortSelect={(sort) => {
              setSortBy(sort);
              setSortOpen(false);
            }}
            sortOptions={sortOptions}
            sortRef={sortRef}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />
        </div>
      </header>

      {actionMessage ? (
        <div className="mb-4 rounded-xl border border-emerald-500/25 bg-emerald-950/35 px-5 py-4 text-sm text-emerald-100">
          {actionMessage}{" "}
          <button
            type="button"
            onClick={clearActionMessage}
            className="font-medium underline underline-offset-2 hover:text-white"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-500/25 bg-red-950/35 px-5 py-4 text-sm text-red-200">
          {error}{" "}
          <button
            type="button"
            onClick={() => fetchScenes()}
            className="font-medium underline underline-offset-2 hover:text-red-100"
          >
            Retry
          </button>
        </div>
      ) : actionError ? (
        <div className="mb-4 rounded-xl border border-red-500/25 bg-red-950/35 px-5 py-4 text-sm text-red-200">
          {actionError}{" "}
          <button
            type="button"
            onClick={clearActionError}
            className="font-medium underline underline-offset-2 hover:text-red-100"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {!error && loading && scenes.length === 0 ? (
        <div className={GRID_CLASS}>
          {Array.from({ length: 10 }).map((_, i) => (
            <SceneCardSkeleton key={i} />
          ))}
        </div>
      ) : !error && !loading && scenes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-6 py-16 text-center">
          <p className="text-sm text-[#a8a8b2]">{emptyMessage}</p>
        </div>
      ) : !error && scenes.length > 0 ? (
        viewMode === "grid" ? (
          <div className={GRID_CLASS}>
            {scenes.map((scene) => (
              <DashboardSceneCard key={scene.id} {...cardProps(scene)} />
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
