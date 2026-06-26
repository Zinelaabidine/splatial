import { AlertTriangle } from "lucide-react";

import type { MockScene } from "@/types/dashboard";

type DeleteSceneModalProps = {
  scene: MockScene;
  deleting: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function DeleteSceneModal({
  scene,
  deleting,
  error,
  onCancel,
  onConfirm,
}: DeleteSceneModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Delete scene</h2>
            <p className="mt-1 text-sm text-gray-500">
              Are you sure you want to delete{" "}
              <span className="font-medium text-gray-700">
                &ldquo;{scene.title}&rdquo;
              </span>
              ? This permanently removes the scene, uploaded files, training
              outputs, and any queued processing jobs. This cannot be undone.
            </p>
          </div>
        </div>
        {error ? (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={deleting}
            onClick={onCancel}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
