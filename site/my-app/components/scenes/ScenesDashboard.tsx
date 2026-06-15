"use client";

import { Play, Plus, Trash2, X, UploadCloud, XCircle, Eye } from "lucide-react";

import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useScenesDashboard } from "@/hooks/scenes/useScenesDashboard";
import type { InputType } from "@/types/api";

const ACCEPT_BY_TYPE: Record<InputType, string> = {
  video:  ".mp4,.mov,video/mp4,video/quicktime",
  images: ".jpg,.jpeg,.png,.webp,.tiff,.zip,image/jpeg,image/png,image/webp,image/tiff,application/zip,application/x-zip-compressed",
  ply:    ".ply,application/octet-stream",
};

const INPUT_TYPE_LABELS: Record<string, string> = {
  video:  "MP4 Video",
  images: "Image Folder",
  ply:    "PLY (Trained)",
};

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  PENDING_UPLOAD: { label: "Pending",    className: "bg-slate-100 text-slate-500" },
  UPLOADED:       { label: "Uploaded",   className: "bg-green-100 text-green-700" },
  QUEUED:         { label: "Queued",     className: "bg-indigo-100 text-indigo-700" },
  PROCESSING:     { label: "Processing", className: "bg-yellow-100 text-yellow-700" },
  READY:          { label: "Ready",      className: "bg-blue-100 text-blue-700" },
  FAILED:         { label: "Failed",     className: "bg-red-100 text-red-700" },
  CANCELLED:      { label: "Cancelled",  className: "bg-slate-100 text-slate-500" },
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? { label: status, className: "bg-slate-100 text-slate-500" };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style.className}`}>
      {style.label}
    </span>
  );
}

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const STAGE_LABEL: Record<string, string> = {
  idle:        "",
  initializing:"Initializing upload…",
  presigning:  "Preparing upload URLs…",
  uploading:   "Uploading file…",
  completing:  "Finalizing…",
  error:       "Upload failed.",
};

export default function ScenesDashboard() {
  const {
    scenes,
    loading,
    fetchError,
    showModal,
    form,
    creating,
    createError,
    uploadStage,
    uploadProgress,
    deletingId,
    submittingId,
    cancellingId,
    actionError,
    fileInputRef,
    isUploading,
    openModal,
    closeModal,
    handleCreate,
    handleSubmit,
    handleCancel,
    handleDelete,
    handleNameChange,
    handleInputTypeChange,
    handleFileChange,
    handleFilePickerClick,
    handleModalBackdropClick,
    clearActionError,
  } = useScenesDashboard();

  return (
    <Layout activeNav="library">
      <div className="w-full max-w-5xl self-start">

        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Your Scenes</h1>
            <p className="mt-1 text-sm text-slate-500">Manage your 3D scene library.</p>
          </div>
          <Button onClick={openModal}>
            <Plus className="mr-1.5 h-4 w-4" />
            Create New Scene
          </Button>
        </div>

        {/* Action error banner */}
        {actionError && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            <span>{actionError}</span>
            <button type="button" onClick={clearActionError} className="ml-3 text-red-400 hover:text-red-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Table / empty states */}
        {loading ? (
          <div className="py-20 text-center text-sm text-slate-400">Loading scenes…</div>
        ) : fetchError ? (
          <div className="py-20 text-center text-sm text-red-500">{fetchError}</div>
        ) : scenes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white py-20 text-center">
            <p className="text-sm text-slate-400">
              No scenes yet.{" "}
              <button type="button" className="font-medium text-indigo-600 hover:underline" onClick={openModal}>
                Create your first scene.
              </button>
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-100">
              <thead>
                <tr className="bg-slate-50">
                  {["Scene Name", "Input Type", "Date Uploaded", "Status", "Actions"].map((col) => (
                    <th key={col} scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {scenes.map((scene) => (
                  <tr key={scene.sceneId} className="transition-colors hover:bg-slate-50/50">
                    <td className="px-4 py-3.5 text-sm font-medium text-slate-900">{scene.name}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-600">{INPUT_TYPE_LABELS[scene.inputType] ?? scene.inputType}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-500">{formatDate(scene.createdAt)}</td>
                    <td className="px-4 py-3.5"><StatusBadge status={scene.status} /></td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5">
                        {scene.status === "READY" && (
                          <a
                            href={`/scenes/view?id=${scene.sceneId}`}
                            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-50"
                            aria-label={`View scene ${scene.name}`}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View
                          </a>
                        )}
                        {["UPLOADED", "READY", "FAILED"].includes(scene.status) && (
                          <button
                            type="button"
                            disabled={submittingId === scene.sceneId}
                            onClick={() => handleSubmit(scene.sceneId)}
                            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-50 disabled:pointer-events-none disabled:opacity-40"
                            aria-label={`Submit scene ${scene.name} for processing`}
                          >
                            <Play className="h-3.5 w-3.5" />
                            {submittingId === scene.sceneId ? "Submitting…" : "Submit"}
                          </button>
                        )}
                        {["QUEUED", "PROCESSING"].includes(scene.status) && (
                          <button
                            type="button"
                            disabled={cancellingId === scene.sceneId}
                            onClick={() => handleCancel(scene.sceneId)}
                            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-50 disabled:pointer-events-none disabled:opacity-40"
                            aria-label={`Cancel scene ${scene.name}`}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            {cancellingId === scene.sceneId ? "Cancelling…" : "Cancel"}
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={deletingId === scene.sceneId}
                          onClick={() => handleDelete(scene.sceneId)}
                          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:pointer-events-none disabled:opacity-40"
                          aria-label={`Delete scene ${scene.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Create Scene Modal ──────────────────────────────────────────────── */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-scene-title"
          onClick={handleModalBackdropClick}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">

            {/* Modal header */}
            <div className="mb-5 flex items-center justify-between">
              <h2 id="create-scene-title" className="text-base font-semibold text-slate-900">
                Create New Scene
              </h2>
              <button
                type="button"
                onClick={closeModal}
                disabled={creating}
                aria-label="Close dialog"
                className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:pointer-events-none disabled:opacity-40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="flex flex-col gap-4">

              {/* Scene Name */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="scene-name" className="text-xs font-medium text-slate-700">
                  Scene Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="scene-name"
                  type="text"
                  required
                  autoFocus
                  disabled={isUploading}
                  value={form.name}
                  onChange={handleNameChange}
                  placeholder="e.g. Garden scan, Office walkthrough"
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:opacity-50"
                />
              </div>

              {/* Input Type */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="input-type" className="text-xs font-medium text-slate-700">
                  Input Type <span className="text-red-500">*</span>
                </label>
                <select
                  id="input-type"
                  disabled={isUploading}
                  value={form.inputType}
                  onChange={handleInputTypeChange}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:opacity-50"
                >
                  <option value="video">MP4 Video</option>
                  <option value="images">Image Folder (ZIP)</option>
                </select>
              </div>

              {/* File picker */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="scene-file" className="text-xs font-medium text-slate-700">
                  File <span className="text-red-500">*</span>
                </label>
                <div
                  className={[
                    "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-5 transition",
                    form.file
                      ? "border-indigo-300 bg-indigo-50/40"
                      : "border-slate-200 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50/30",
                    isUploading ? "pointer-events-none opacity-50" : "",
                  ].join(" ")}
                  onClick={handleFilePickerClick}
                >
                  <UploadCloud className={`h-6 w-6 ${form.file ? "text-indigo-400" : "text-slate-400"}`} />
                  {form.file ? (
                    <div className="text-center">
                      <p className="text-xs font-medium text-slate-800 break-all">{form.file.name}</p>
                      <p className="text-[11px] text-slate-400">{formatBytes(form.file.size)}</p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      Click to select{" "}
                      <span className="font-medium text-indigo-600">
                        {form.inputType === "video" ? "a video file (.mp4, .mov)" : "images or a ZIP"}
                      </span>
                    </p>
                  )}
                  <input
                    ref={fileInputRef}
                    id="scene-file"
                    type="file"
                    required
                    accept={ACCEPT_BY_TYPE[form.inputType]}
                    className="sr-only"
                    onChange={handleFileChange}
                  />
                </div>
              </div>

              {/* Progress bar (shown while uploading) */}
              {isUploading && (
                <div className="flex flex-col gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-600">{STAGE_LABEL[uploadStage]}</span>
                    {uploadStage === "uploading" && (
                      <span className="text-xs font-medium text-indigo-600">{uploadProgress}%</span>
                    )}
                  </div>
                  <Progress value={uploadStage === "uploading" ? uploadProgress : null} />
                </div>
              )}

              {/* Error */}
              {createError && (
                <p className="text-xs text-red-500">{createError}</p>
              )}

              {/* Actions */}
              <div className="mt-1 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={closeModal} disabled={creating}>
                  Cancel
                </Button>
                <Button type="submit" disabled={creating || !form.name.trim() || !form.file}>
                  {isUploading ? (
                    uploadStage === "uploading"
                      ? `Uploading ${uploadProgress}%`
                      : STAGE_LABEL[uploadStage]
                  ) : (
                    <>
                      <UploadCloud className="mr-1.5 h-4 w-4" />
                      Upload &amp; Create
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
