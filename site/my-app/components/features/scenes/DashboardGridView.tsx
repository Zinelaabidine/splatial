import { ChevronDown, RefreshCw } from "lucide-react";

import SceneCard from "@/components/dashboard/SceneCard";
import { SORT_LABELS } from "@/lib/scenes/sceneMappers";
import type { MockScene, SortOption } from "@/types/dashboard";

type DashboardGridViewProps = {
  scenes: MockScene[];
  loading: boolean;
  error: string | null;
  sortBy: SortOption;
  sortOpen: boolean;
  sceneCount: number;
  onSortToggle: () => void;
  onSortSelect: (option: SortOption) => void;
  onRetry: () => void;
  onViewScene: (scene: MockScene) => void;
  onSubmitScene: (scene: MockScene) => void;
  onCancelScene?: (scene: MockScene) => void;
  onDeleteScene: (scene: MockScene) => void;
  cancellingId?: string | null;
};

export default function DashboardGridView({
  scenes,
  loading,
  error,
  sortBy,
  sortOpen,
  sceneCount,
  onSortToggle,
  onSortSelect,
  onRetry,
  onViewScene,
  onSubmitScene,
  onCancelScene,
  onDeleteScene,
  cancellingId = null,
}: DashboardGridViewProps) {
  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            My Scenes{!loading && ` (${sceneCount})`}
          </h1>
          {loading && (
            <RefreshCw className="h-4 w-4 animate-spin text-gray-400" />
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={onSortToggle}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 shadow-sm transition-colors hover:bg-gray-50"
          >
            Sort by: {SORT_LABELS[sortBy]}
            <ChevronDown className="h-4 w-4 text-gray-400" />
          </button>

          {sortOpen && (
            <div className="absolute right-0 top-full z-10 mt-1 min-w-[160px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
              {(Object.keys(SORT_LABELS) as SortOption[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => onSortSelect(option)}
                  className="block w-full px-4 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
                >
                  {SORT_LABELS[option]}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-600">
          {error}{" "}
          <button
            type="button"
            onClick={onRetry}
            className="ml-2 font-medium underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : scenes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white py-20 text-center">
          <p className="text-sm text-gray-500">
            No scenes yet.{" "}
            <span className="text-gray-400">
              Click{" "}
              <span className="font-medium text-purple-600">+ Create</span> to
              upload your first scene.
            </span>
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {scenes.map((scene) => (
            <SceneCard
              key={scene.id}
              scene={scene}
              onViewScene={onViewScene}
              onSubmitScene={onSubmitScene}
              onCancelScene={onCancelScene}
              onDeleteScene={onDeleteScene}
              cancelling={cancellingId === scene.sceneId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
