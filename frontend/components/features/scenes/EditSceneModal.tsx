"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";

import { SCENE_CATEGORIES } from "@/lib/scenes/categories";
import SceneTagsInput from "@/components/features/scenes/SceneTagsInput";
import { SceneVisibilityToggle } from "@/components/features/scenes/SceneVisibilityControl";
import { Button } from "@/components/ui/button";
import { useSceneViewUrl } from "@/hooks/viewer/useSceneViewUrl";
import { ApiRequestError } from "@/lib/api/apiErrors";
import {
  blobToObjectUrl,
  captureViewerCanvas,
} from "@/lib/viewer/captureCanvas";
import {
  presignSceneThumbnail,
  updateScene,
  uploadThumbnailToS3,
} from "@/services/scenesService";
import type { SceneVisibility } from "@/types/api";
import type { DashboardScene } from "@/types/splatworks";

const LegacySplatViewer = dynamic(
  () => import("@/components/viewer/LegacySplatViewer"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-[#0a0a0a]">
        <Loader2 className="h-6 w-6 animate-spin text-[#909090]" />
      </div>
    ),
  },
);

type EditSceneModalProps = {
  scene: DashboardScene;
  saving: boolean;
  error: string | null;
  onDismiss: () => void;
  onSaved: (updated: {
    title: string;
    thumbnailUrl?: string;
    visibility?: SceneVisibility;
    category?: string | null;
    tags?: string[];
  }) => void;
  onSavingChange: (saving: boolean) => void;
  onError: (message: string | null) => void;
};

function EditSceneViewer({ sceneId }: { sceneId: string }) {
  const { splatUrl, error, loading } = useSceneViewUrl(sceneId);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#0a0a0a]">
        <p className="text-sm text-[#909090]">Loading splat…</p>
      </div>
    );
  }

  if (error || !splatUrl) {
    return (
      <div className="flex h-full items-center justify-center bg-[#0a0a0a] px-6 text-center">
        <p className="text-sm text-red-400">{error ?? "Unable to load scene."}</p>
      </div>
    );
  }

  return <LegacySplatViewer splatUrl={splatUrl} />;
}

export default function EditSceneModal({
  scene,
  saving,
  error,
  onDismiss,
  onSaved,
  onSavingChange,
  onError,
}: EditSceneModalProps) {
  const sceneId = scene.sceneId ?? scene.id;
  const [name, setName] = useState(scene.title);
  const [visibility, setVisibility] = useState<SceneVisibility>(scene.visibility ?? "PRIVATE");
  const [category, setCategory] = useState<string | null>(scene.category ?? null);
  const [tags, setTags] = useState<string[]>(scene.tags ?? []);
  const [thumbnailBlob, setThumbnailBlob] = useState<Blob | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(
    scene.thumbnailUrl ?? null,
  );
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    return () => {
      if (thumbnailPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(thumbnailPreview);
      }
    };
  }, [thumbnailPreview]);

  const handleCaptureThumbnail = useCallback(async () => {
    setCapturing(true);
    onError(null);
    try {
      const blob = await captureViewerCanvas();
      if (!blob) {
        onError("Could not capture the viewer. Try again after the splat finishes loading.");
        return;
      }
      setThumbnailBlob(blob);
      setThumbnailPreview((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return blobToObjectUrl(blob);
      });
    } finally {
      setCapturing(false);
    }
  }, [onError]);

  const handleSave = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      onError("Scene name is required.");
      return;
    }

    const nameChanged = trimmedName !== scene.title;
    const thumbnailChanged = thumbnailBlob != null;
    const visibilityChanged = visibility !== (scene.visibility ?? "PRIVATE");
    const categoryChanged = category !== (scene.category ?? null);
    const tagsChanged =
      tags.length !== (scene.tags ?? []).length ||
      tags.some((tag, i) => tag !== (scene.tags ?? [])[i]);

    if (!nameChanged && !thumbnailChanged && !visibilityChanged && !categoryChanged && !tagsChanged) {
      onDismiss();
      return;
    }

    onSavingChange(true);
    onError(null);

    try {
      let thumbnailKey: string | undefined;

      if (thumbnailChanged && thumbnailBlob) {
        const presign = await presignSceneThumbnail(sceneId);
        await uploadThumbnailToS3(
          presign.uploadUrl,
          thumbnailBlob,
          presign.contentType,
        );
        thumbnailKey = presign.key;
      }

      const payload: {
        name?: string;
        thumbnailKey?: string;
        visibility?: SceneVisibility;
        category?: string | null;
        tags?: string[];
      } = {};
      if (nameChanged) payload.name = trimmedName;
      if (thumbnailKey) payload.thumbnailKey = thumbnailKey;
      if (visibilityChanged) payload.visibility = visibility;
      if (categoryChanged) payload.category = category;
      if (tagsChanged) payload.tags = tags;

      const updated = await updateScene(sceneId, payload);

      onSaved({
        title: updated.name,
        visibility: updated.visibility,
        category: updated.category ?? null,
        tags: updated.tags ?? [],
        ...(updated.thumbnailUrl ? { thumbnailUrl: updated.thumbnailUrl } : {}),
      });
    } catch (err) {
      console.error("[EditSceneModal] save failed", err);
      onError(
        err instanceof ApiRequestError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to save changes. Please try again.",
      );
    } finally {
      onSavingChange(false);
    }
  }, [
    name,
    scene.title,
    scene.visibility,
    scene.category,
    scene.tags,
    visibility,
    category,
    tags,
    thumbnailBlob,
    sceneId,
    onDismiss,
    onError,
    onSaved,
    onSavingChange,
  ]);

  const busy = saving || capturing;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-scene-title"
      onClick={busy ? undefined : onDismiss}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[#404040] bg-[#1a1a1a] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-[#303030] px-5 py-4">
          <div>
            <h2 id="edit-scene-title" className="text-base font-semibold text-white">
              Edit scene
            </h2>
            <p className="mt-0.5 text-xs text-[#909090]">
              Rename the scene and orbit to a view you like, then set it as the thumbnail.
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            disabled={busy}
            aria-label="Close"
            className="rounded-lg p-1.5 text-[#909090] transition-colors hover:bg-[#303030] hover:text-white disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-scene-name" className="text-xs font-medium text-[#d4d4d4]">
              Scene name
            </label>
            <input
              id="edit-scene-name"
              type="text"
              value={name}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
              className="rounded-lg border border-[#404040] bg-[#262626] px-3 py-2 text-sm text-white outline-none transition focus:border-[#6366f1] focus:ring-2 focus:ring-[#6366f1]/20 disabled:opacity-50"
            />
          </div>

          <SceneVisibilityToggle
            visibility={visibility}
            disabled={busy}
            onToggle={setVisibility}
          />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-scene-category" className="text-xs font-medium text-[#d4d4d4]">
              Category
            </label>
            <select
              id="edit-scene-category"
              value={category ?? ""}
              disabled={busy}
              onChange={(e) => setCategory(e.target.value === "" ? null : e.target.value)}
              className="rounded-lg border border-[#404040] bg-[#262626] px-3 py-2 text-sm text-white outline-none transition focus:border-[#6366f1] focus:ring-2 focus:ring-[#6366f1]/20 disabled:opacity-50"
            >
              <option value="">None</option>
              {SCENE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <SceneTagsInput tags={tags} disabled={busy} onChange={setTags} />

          <div className="relative overflow-hidden rounded-xl border border-[#303030] bg-[#0a0a0a]">
            <div className="relative h-[min(52vh,420px)] w-full [&_.splat-viewer-container]:h-full [&_#canvas]:h-full [&_#canvas]:w-full">
              <EditSceneViewer sceneId={sceneId} />
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-10">
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => void handleCaptureThumbnail()}
                className="pointer-events-auto bg-white/10 text-white backdrop-blur hover:bg-white/20"
              >
                <Camera data-icon="inline-start" />
                {capturing ? "Capturing…" : "Set thumbnail from current view"}
              </Button>
            </div>
          </div>

          {thumbnailPreview && (
            <div className="flex items-center gap-3 rounded-lg border border-[#303030] bg-[#212121] p-3">
              {/* Presigned S3 / blob URLs — not compatible with next/image */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumbnailPreview}
                alt="Selected thumbnail preview"
                className="h-16 w-24 shrink-0 rounded-md object-cover"
              />
              <p className="text-xs text-[#909090]">
                {thumbnailBlob
                  ? "New thumbnail selected — save to upload."
                  : "Current thumbnail"}
              </p>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-[#303030] px-5 py-4">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onDismiss}
            className="border-[#404040] bg-transparent text-[#d4d4d4] hover:bg-[#303030] hover:text-white"
          >
            Cancel
          </Button>
          <Button type="button" disabled={busy || !name.trim()} onClick={() => void handleSave()}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </footer>
      </div>
    </div>
  );
}
