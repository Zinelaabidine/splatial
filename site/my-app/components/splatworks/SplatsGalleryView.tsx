"use client";

import { ChevronDown, RefreshCw } from "lucide-react";

import DeleteSceneModal from "@/components/features/scenes/DeleteSceneModal";
import { usePageSearch } from "@/components/layout/AppShellContext";
import SplatCard from "@/components/splatworks/SplatCard";
import { useSplatsGallery } from "@/hooks/splats/useSplatsGallery";

const SORT_LABELS = {
  newest: "Newest",
  oldest: "Oldest",
  name: "Name",
} as const;

export default function SplatsGalleryView() {
  const { search } = usePageSearch("Search splats");
  const gallery = useSplatsGallery(search);

  const {
    splats,
    totalReady,
    loading,
    error,
    sortBy,
    setSortBy,
    sortOpen,
    setSortOpen,
    sortOptions,
    deleteTarget,
    deleting,
    deleteError,
    actionMessage,
    clearActionMessage,
    fetchSplats,
    open3D,
    startTour,
    openDetail,
    download,
    share,
    rename,
    remove,
    dismissDeleteModal,
    confirmDelete,
  } = gallery;

  const emptyMessage =
    search.trim().length > 0
      ? "No splats match your search."
      : totalReady === 0
        ? "No completed splats yet. Finish training a scene to see it here."
        : "No splats match your search.";

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
            Splatworks: My Splats
            {!loading && totalReady > 0 ? ` (${totalReady})` : ""}
          </h1>
          {loading && (
            <RefreshCw className="h-4 w-4 animate-spin text-[#909090]" aria-hidden />
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setSortOpen((o) => !o)}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-[#303030] bg-[#212121] px-3 text-sm text-[#e5e5e5] hover:bg-[#303030]"
          >
            {SORT_LABELS[sortBy]}
            <ChevronDown className="h-4 w-4 text-[#909090]" />
          </button>
          {sortOpen && (
            <div className="absolute right-0 top-full z-10 mt-1 min-w-[140px] rounded-lg border border-[#303030] bg-[#212121] py-1 shadow-xl">
              {sortOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setSortBy(option);
                    setSortOpen(false);
                  }}
                  className="block w-full px-4 py-2 text-left text-sm text-[#e5e5e5] hover:bg-[#303030]"
                >
                  {SORT_LABELS[option]}
                </button>
              ))}
            </div>
          )}
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
            onClick={() => void fetchSplats()}
            className="ml-2 font-medium underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[4/5] animate-pulse rounded-xl bg-[#212121]"
            />
          ))}
        </div>
      ) : splats.length === 0 ? (
        <p className="py-16 text-center text-sm text-[#909090]">{emptyMessage}</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {splats.map((splat) => (
            <SplatCard
              key={splat.id}
              splat={splat}
              onOpen3D={open3D}
              onTour={startTour}
              onCardClick={openDetail}
              onDownload={download}
              onShare={share}
              onRename={rename}
              onDelete={remove}
            />
          ))}
        </div>
      )}

      {deleteTarget && (
        <DeleteSceneModal
          scene={{
            id: deleteTarget.id,
            sceneId: deleteTarget.sceneId ?? deleteTarget.id,
            title: deleteTarget.title,
            state: "complete",
            createdAt: deleteTarget.createdAt,
            lastModified: deleteTarget.createdAt,
          }}
          deleting={deleting}
          error={deleteError}
          onDismiss={dismissDeleteModal}
          onConfirmDelete={confirmDelete}
        />
      )}
    </div>
  );
}
