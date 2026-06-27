import { AlertTriangle } from "lucide-react";

import { isActiveGpuJobStatus } from "@/lib/scenes/sceneMappers";
import type { MockScene } from "@/types/dashboard";

type DeleteSceneModalProps = {
  scene: MockScene;
  deleting: boolean;
  cancelling?: boolean;
  error?: string | null;
  onDismiss: () => void;
  onConfirmDelete: () => void;
  onCancelProcessing?: () => void;
};

function sceneHasActiveGpuJob(scene: MockScene): boolean {
  if (isActiveGpuJobStatus(scene.apiStatus)) return true;
  return scene.state === "preprocessing" || scene.state === "processing";
}

export default function DeleteSceneModal({
  scene,
  deleting,
  cancelling = false,
  error,
  onDismiss,
  onConfirmDelete,
  onCancelProcessing,
}: DeleteSceneModalProps) {
  const activeJob = sceneHasActiveGpuJob(scene);
  const busy = deleting || cancelling;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onDismiss}
    >
      <div
        className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              activeJob ? "bg-amber-100" : "bg-red-100"
            }`}
          >
            <AlertTriangle
              className={`h-5 w-5 ${activeJob ? "text-amber-600" : "text-red-600"}`}
            />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Delete scene</h2>
            {activeJob ? (
              <>
                <p className="mt-1 text-sm text-gray-600">
                  <span className="font-medium text-gray-800">
                    &ldquo;{scene.title}&rdquo;
                  </span>{" "}
                  is{" "}
                  {scene.apiStatus === "PROCESSING" || scene.state === "processing"
                    ? "training on a GPU worker"
                    : "queued for GPU training"}
                  . Deleting now can leave orphaned queue messages and waste compute
                  until the worker exits.
                </p>
                <p className="mt-2 text-sm text-gray-500">
                  Stop processing first, then delete when you no longer need the scene.
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-gray-500">
                Are you sure you want to delete{" "}
                <span className="font-medium text-gray-700">
                  &ldquo;{scene.title}&rdquo;
                </span>
                ? This permanently removes the scene, uploaded files, and training
                outputs. This cannot be undone.
              </p>
            )}
          </div>
        </div>
        {error ? (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onDismiss}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            Keep scene
          </button>
          {activeJob && onCancelProcessing ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={onConfirmDelete}
                className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Delete anyway"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onCancelProcessing}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-60"
              >
                {cancelling ? "Cancelling…" : "Cancel processing"}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={onConfirmDelete}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
