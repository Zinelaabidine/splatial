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
    sortBy,
    sortOpen,
    deleteTarget,
    deleting,
    deleteError,
    sceneCount,
    setSortBy,
    setSortOpen,
    fetchScenes,
    handleViewScene,
    handleDeleteScene,
    handleSubmitScene,
    dismissDeleteModal,
    confirmDelete,
  } = useDashboardScenes();

  return (
    <>
      <DashboardGridView
        scenes={sorted}
        loading={loading}
        error={error}
        sortBy={sortBy}
        sortOpen={sortOpen}
        sceneCount={sceneCount}
        onSortToggle={() => setSortOpen((o) => !o)}
        onSortSelect={(option) => {
          setSortBy(option);
          setSortOpen(false);
        }}
        onRetry={() => fetchScenes()}
        onViewScene={handleViewScene}
        onSubmitScene={handleSubmitScene}
        onDeleteScene={handleDeleteScene}
      />

      {deleteTarget && (
        <DeleteSceneModal
          scene={deleteTarget}
          deleting={deleting}
          error={deleteError}
          onCancel={dismissDeleteModal}
          onConfirm={confirmDelete}
        />
      )}
    </>
  );
}
