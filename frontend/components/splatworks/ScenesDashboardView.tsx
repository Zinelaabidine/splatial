"use client";

import DeleteSceneModal from "@/components/features/scenes/DeleteSceneModal";
import EditSceneModal from "@/components/features/scenes/EditSceneModal";
import DashboardSceneCard from "@/components/splatworks/DashboardSceneCard";
import SceneCardSkeleton from "@/components/splatworks/SceneCardSkeleton";
import { usePageSearch } from "@/components/layout/AppShellContext";
import { useScenesDashboardGrid } from "@/hooks/scenes/useScenesDashboardGrid";
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

export default function ScenesDashboardView() {
  const { search } = usePageSearch("Search scenes");
  const {
    scenes,
    loading,
    error,
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

  const emptyMessage = search.trim()
    ? "No scenes match your search."
    : "No scenes yet. Create one to get started.";

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <h1 className="mb-6 text-xl font-bold tracking-tight text-white sm:text-2xl">
        Splatworks: Scenes
      </h1>

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
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SceneCardSkeleton key={i} />
          ))}
        </div>
      ) : !error && !loading && scenes.length === 0 ? (
        <p className="py-16 text-center text-sm text-[#909090]">{emptyMessage}</p>
      ) : !error && scenes.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
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
              visibilityUpdating={visibilityUpdatingId === scene.sceneId}
            />
          ))}
        </div>
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
