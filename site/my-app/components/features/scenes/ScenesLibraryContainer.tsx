"use client";

import DashboardGridView from "@/components/features/scenes/DashboardGridView";
import DeleteSceneModal from "@/components/features/scenes/DeleteSceneModal";
import { useDashboardScenes } from "@/hooks/scenes/useDashboardScenes";

/** Thin coordinator: loads scene data and passes it to presentational UI. */
export default function ScenesLibraryContainer() {
  const {
    sorted,
    loading,
    error,
    actionMessage,
    sortBy,
    sortOpen,
    deleteTarget,
    deleting,
    deleteError,
    cancellingId,
    modalCancelling,
    sceneCount,
    setSortBy,
    setSortOpen,
    fetchScenes,
    handleViewScene,
    handleDeleteScene,
    handleSubmitScene,
    handleCancelScene,
    handleCancelFromModal,
    dismissDeleteModal,
    confirmDelete,
    clearActionMessage,
  } = useDashboardScenes();

  return (
    <>
      {actionMessage ? (
        <div className="mx-auto mb-4 flex max-w-7xl items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          <span>{actionMessage}</span>
          <button
            type="button"
            onClick={clearActionMessage}
            className="ml-3 font-medium text-emerald-600 hover:text-emerald-800"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <DashboardGridView
        scenes={sorted}
        loading={loading}
        error={error}
        sortBy={sortBy}
        sortOpen={sortOpen}
        sceneCount={sceneCount}
        cancellingId={cancellingId}
        onSortToggle={() => setSortOpen((o) => !o)}
        onSortSelect={(option) => {
          setSortBy(option);
          setSortOpen(false);
        }}
        onRetry={() => fetchScenes()}
        onViewScene={handleViewScene}
        onSubmitScene={handleSubmitScene}
        onCancelScene={handleCancelScene}
        onDeleteScene={handleDeleteScene}
      />

      {deleteTarget && (
        <DeleteSceneModal
          scene={deleteTarget}
          deleting={deleting}
          cancelling={modalCancelling}
          error={deleteError}
          onDismiss={dismissDeleteModal}
          onConfirmDelete={confirmDelete}
          onCancelProcessing={handleCancelFromModal}
        />
      )}
    </>
  );
}
