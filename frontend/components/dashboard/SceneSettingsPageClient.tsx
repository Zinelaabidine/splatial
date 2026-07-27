"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  ChevronRight,
  Loader2,
} from "lucide-react";

import SceneTagsInput from "@/components/features/scenes/SceneTagsInput";
import {
  SceneVisibilityBadge,
  SceneVisibilityToggle,
} from "@/components/features/scenes/SceneVisibilityControl";
import StatusDot, { STATUS_LABELS } from "@/components/splatworks/StatusDot";
import { Button } from "@/components/ui/button";
import { usePageSearch } from "@/components/layout/AppShellContext";
import { useSceneViewUrl } from "@/hooks/viewer/useSceneViewUrl";
import { ApiRequestError } from "@/lib/api/apiErrors";
import {
  blobToObjectUrl,
  captureViewerCanvas,
} from "@/lib/viewer/captureCanvas";
import { formatSceneDate } from "@/lib/scenes/sceneMappers";
import { apiSceneToDashboardScene } from "@/lib/scenes/sceneMappers";
import { SCENE_CATEGORIES } from "@/lib/scenes/categories";
import {
  listScenes,
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
      <div className="flex h-full items-center justify-center bg-[var(--nord-bg)]">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--nord-slate)]" />
      </div>
    ),
  },
);

type PageState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "not-found" }
  | { kind: "ready"; scene: DashboardScene };

/** Embedded splat viewer used to preview and capture a new thumbnail. */
function SceneEditorViewer({ sceneId }: { sceneId: string }) {
  const { splatUrl, error, loading } = useSceneViewUrl(sceneId);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--nord-bg)]">
        <p className="text-sm text-[var(--nord-slate)]">Loading splat…</p>
      </div>
    );
  }

  if (error || !splatUrl) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--nord-bg)] px-6 text-center">
        <p className="text-sm text-[var(--nord-danger)]">{error ?? "Unable to load scene."}</p>
      </div>
    );
  }

  return <LegacySplatViewer splatUrl={splatUrl} />;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-[var(--nord-slate)]">{label}</span>
      <span className="min-w-0 truncate text-right font-medium text-[var(--nord-ink)]">
        {value}
      </span>
    </div>
  );
}

export default function SceneSettingsPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sceneId = searchParams.get("id") ?? "";

  usePageSearch("", false);

  const [pageState, setPageState] = useState<PageState>({ kind: "loading" });

  const loadScene = useCallback(async () => {
    if (!sceneId) {
      setPageState({ kind: "not-found" });
      return;
    }
    setPageState({ kind: "loading" });
    try {
      const data = await listScenes();
      const match = (data.scenes ?? []).find((s) => s.sceneId === sceneId);
      if (!match) {
        setPageState({ kind: "not-found" });
        return;
      }
      setPageState({ kind: "ready", scene: apiSceneToDashboardScene(match) });
    } catch (err) {
      console.error("[SceneSettingsPageClient] failed to load scene", err);
      setPageState({
        kind: "error",
        message:
          err instanceof ApiRequestError
            ? err.message
            : "Failed to load scene. Please try again.",
      });
    }
  }, [sceneId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadScene();
  }, [loadScene]);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1.5 text-xs text-[var(--nord-slate)]">
        <Link href="/scenes" className="transition-colors hover:text-[var(--nord-ink)]">
          Scenes
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="truncate text-[var(--nord-ink)]">
          {pageState.kind === "ready" ? pageState.scene.title : "Edit scene"}
        </span>
      </nav>

      <div className="mb-6 flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Back to scenes"
          onClick={() => router.push("/scenes")}
          className="border-[var(--nord-hairline)] bg-transparent text-[var(--nord-ink)] hover:bg-[var(--nord-surface)]"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-tight text-[var(--nord-ink)] sm:text-2xl">
            Edit scene
          </h1>
          <p className="mt-0.5 text-sm text-[var(--nord-slate)]">
            Update details and choose how this scene appears to others.
          </p>
        </div>
      </div>

      {pageState.kind === "loading" && <LoadingState />}
      {pageState.kind === "error" && (
        <ErrorState message={pageState.message} onRetry={() => void loadScene()} />
      )}
      {pageState.kind === "not-found" && <NotFoundState />}
      {pageState.kind === "ready" && (
        <SceneSettingsEditor
          // Remount (resetting local form state) whenever a *different* scene
          // loads. Re-saving the same scene keeps this instance mounted so the
          // form doesn't blow away in-progress edits.
          key={pageState.scene.id}
          scene={pageState.scene}
          onSaved={(updated) =>
            setPageState((prev) =>
              prev.kind === "ready" ? { kind: "ready", scene: updated } : prev,
            )
          }
        />
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="space-y-6">
        <div className="h-64 animate-pulse rounded-2xl border border-[var(--nord-hairline)] bg-[var(--nord-surface)]" />
        <div className="h-40 animate-pulse rounded-2xl border border-[var(--nord-hairline)] bg-[var(--nord-surface)]" />
      </div>
      <div className="h-96 animate-pulse rounded-2xl border border-[var(--nord-hairline)] bg-[var(--nord-surface)]" />
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-[var(--nord-danger)] bg-[var(--nord-danger-tint)] px-6 py-10 text-center">
      <p className="text-sm text-[var(--nord-danger)]">{message}</p>
      <Button type="button" variant="outline" onClick={onRetry} className="mt-4">
        Retry
      </Button>
    </div>
  );
}

function NotFoundState() {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--nord-hairline)] bg-[var(--nord-tint)] px-6 py-16 text-center">
      <p className="text-sm text-[var(--nord-slate)]">
        We couldn&apos;t find that scene. It may have been deleted, or the link is out of date.
      </p>
      <Link href="/scenes" className="mt-4 inline-block">
        <Button type="button" variant="outline">
          Back to your scenes
        </Button>
      </Link>
    </div>
  );
}

function SceneSettingsEditor({
  scene,
  onSaved,
}: {
  scene: DashboardScene;
  onSaved: (updated: DashboardScene) => void;
}) {
  const sceneId = scene.sceneId ?? scene.id;
  const editable = scene.status === "completed";

  const [name, setName] = useState(scene.title);
  const [visibility, setVisibility] = useState<SceneVisibility>(scene.visibility ?? "PRIVATE");
  const [category, setCategory] = useState<string | null>(scene.category ?? null);
  const [tags, setTags] = useState<string[]>(scene.tags ?? []);
  const [thumbnailBlob, setThumbnailBlob] = useState<Blob | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(
    scene.thumbnailUrl ?? null,
  );
  const [capturing, setCapturing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (thumbnailPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(thumbnailPreview);
      }
    };
  }, [thumbnailPreview]);

  const nameChanged = name.trim() !== scene.title;
  const thumbnailChanged = thumbnailBlob != null;
  const visibilityChanged = visibility !== (scene.visibility ?? "PRIVATE");
  const categoryChanged = category !== (scene.category ?? null);
  const tagsChanged = useMemo(
    () =>
      tags.length !== (scene.tags ?? []).length ||
      tags.some((tag, i) => tag !== (scene.tags ?? [])[i]),
    [tags, scene.tags],
  );
  const hasChanges =
    nameChanged || thumbnailChanged || visibilityChanged || categoryChanged || tagsChanged;

  const handleCaptureThumbnail = useCallback(async () => {
    setCapturing(true);
    setError(null);
    try {
      const blob = await captureViewerCanvas();
      if (!blob) {
        setError("Could not capture the viewer. Try again after the splat finishes loading.");
        return;
      }
      setThumbnailBlob(blob);
      setThumbnailPreview((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return blobToObjectUrl(blob);
      });
      setSuccessMessage(null);
    } finally {
      setCapturing(false);
    }
  }, []);

  const handleSave = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Scene name is required.");
      return;
    }
    if (!hasChanges) return;

    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      let thumbnailKey: string | undefined;

      if (thumbnailChanged && thumbnailBlob) {
        const presign = await presignSceneThumbnail(sceneId);
        await uploadThumbnailToS3(presign.uploadUrl, thumbnailBlob, presign.contentType);
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

      setThumbnailBlob(null);
      onSaved(apiSceneToDashboardScene(updated));
      setSuccessMessage("Scene updated.");
    } catch (err) {
      console.error("[SceneSettingsPageClient] save failed", err);
      setError(
        err instanceof ApiRequestError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to save changes. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }, [
    name,
    hasChanges,
    thumbnailChanged,
    thumbnailBlob,
    sceneId,
    nameChanged,
    visibilityChanged,
    visibility,
    categoryChanged,
    category,
    tagsChanged,
    tags,
    onSaved,
  ]);

  const busy = saving || capturing;

  return (
    <div className="flex flex-col gap-4">
      {!editable && (
        <div className="rounded-xl border border-[var(--nord-hairline)] bg-[var(--nord-tint)] px-5 py-4 text-sm text-[var(--nord-slate)]">
          This scene is still {scene.caption.toLowerCase()}. Details can be viewed below, and full
          editing (including the thumbnail) unlocks once processing finishes.
        </div>
      )}

      {successMessage && (
        <div className="rounded-xl border border-[var(--nord-success)] bg-[var(--nord-success-tint)] px-5 py-3 text-sm text-[var(--nord-success)]">
          {successMessage}
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-xl border border-[var(--nord-danger)] bg-[var(--nord-danger-tint)] px-5 py-3 text-sm text-[var(--nord-danger)]">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* Left column — metadata */}
        <div className="space-y-6">
          <section className="rounded-2xl border border-[var(--nord-hairline)] bg-[var(--nord-surface)] p-5">
            <h2 className="text-sm font-semibold text-[var(--nord-ink)]">Details</h2>
            <p className="mt-0.5 text-xs text-[var(--nord-slate)]">
              Name, category, tags and who can see this scene.
            </p>

            <div className="mt-4 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="scene-name" className="text-xs font-medium text-[var(--nord-ink)]">
                  Scene name
                </label>
                <input
                  id="scene-name"
                  type="text"
                  value={name}
                  disabled={busy}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-lg border border-[var(--nord-hairline)] bg-[var(--nord-surface)] px-3 py-2 text-sm text-[var(--nord-ink)] outline-none transition focus:border-[#6366f1] focus:ring-2 focus:ring-[#6366f1]/20 disabled:opacity-50"
                />
              </div>

              <SceneVisibilityToggle
                visibility={visibility}
                disabled={busy}
                onToggle={setVisibility}
              />

              <div className="flex flex-col gap-1.5">
                <label htmlFor="scene-category" className="text-xs font-medium text-[var(--nord-ink)]">
                  Category
                </label>
                <select
                  id="scene-category"
                  value={category ?? ""}
                  disabled={busy}
                  onChange={(e) => setCategory(e.target.value === "" ? null : e.target.value)}
                  className="rounded-lg border border-[var(--nord-hairline)] bg-[var(--nord-surface)] px-3 py-2 text-sm text-[var(--nord-ink)] outline-none transition focus:border-[#6366f1] focus:ring-2 focus:ring-[#6366f1]/20 disabled:opacity-50"
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
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-[var(--nord-hairline)] pt-4">
              <Link href="/scenes">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  className="border-[var(--nord-hairline)] bg-transparent text-[var(--nord-ink)] hover:bg-[var(--nord-surface)] hover:text-[var(--nord-ink)]"
                >
                  Cancel
                </Button>
              </Link>
              <Button
                type="button"
                disabled={busy || !name.trim() || !hasChanges}
                onClick={() => void handleSave()}
              >
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--nord-hairline)] bg-[var(--nord-surface)] p-5">
            <h2 className="text-sm font-semibold text-[var(--nord-ink)]">Scene info</h2>
            <p className="mt-0.5 text-xs text-[var(--nord-slate)]">
              Read-only details from the processing pipeline.
            </p>
            <div className="mt-3 divide-y divide-[var(--nord-hairline)]">
              <InfoRow
                label="Visibility"
                value={<SceneVisibilityBadge visibility={visibility} />}
              />
              <InfoRow
                label="Status"
                value={
                  <span className="inline-flex items-center gap-1.5">
                    <StatusDot status={scene.status} className="h-1.5 w-1.5" />
                    {STATUS_LABELS[scene.status]}
                    {scene.status !== "completed" ? ` · ${scene.caption}` : ""}
                  </span>
                }
              />
              <InfoRow
                label="Created"
                value={scene.createdAtIso ? formatSceneDate(scene.createdAtIso) : undefined}
              />
              {scene.workerVersion && (
                <InfoRow label="Worker version" value={scene.workerVersion} />
              )}
              {scene.forkedFromUsername && (
                <InfoRow
                  label="Forked from"
                  value={
                    <Link
                      href={`/u/${scene.forkedFromUsername}`}
                      className="text-[var(--nord-ink)] underline-offset-2 hover:underline"
                    >
                      @{scene.forkedFromUsername}
                    </Link>
                  }
                />
              )}
              <InfoRow label="Forks" value={scene.forksCount ?? undefined} />
              <InfoRow label="Reactions" value={scene.reactionsTotal ?? undefined} />
              <InfoRow label="Comments" value={scene.commentsCount ?? undefined} />
            </div>
          </section>
        </div>

        {/* Right column — thumbnail */}
        <section className="h-fit rounded-2xl border border-[var(--nord-hairline)] bg-[var(--nord-surface)] p-5">
          <h2 className="text-sm font-semibold text-[var(--nord-ink)]">Thumbnail</h2>
          <p className="mt-0.5 text-xs text-[var(--nord-slate)]">
            {editable
              ? "Orbit to a view you like, then set it as the thumbnail."
              : "Available once this scene finishes processing."}
          </p>

          {editable ? (
            <>
              <div className="relative mt-4 overflow-hidden rounded-xl border border-[var(--nord-hairline)] bg-[var(--nord-bg)]">
                <div className="relative h-[280px] w-full [&_.splat-viewer-container]:h-full [&_#canvas]:h-full [&_#canvas]:w-full">
                  <SceneEditorViewer sceneId={sceneId} />
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-[var(--nord-scrim)] to-transparent px-4 pb-4 pt-10">
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy}
                    onClick={() => void handleCaptureThumbnail()}
                    className="pointer-events-auto bg-[var(--nord-tint)] text-[var(--nord-ink)] backdrop-blur hover:bg-[var(--nord-tint)]"
                  >
                    <Camera data-icon="inline-start" />
                    {capturing ? "Capturing…" : "Set thumbnail from current view"}
                  </Button>
                </div>
              </div>

              {thumbnailPreview && (
                <div className="mt-4 flex items-center gap-3 rounded-lg border border-[var(--nord-hairline)] bg-[var(--nord-bg)] p-3">
                  {/* Presigned S3 / blob URLs — not compatible with next/image */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumbnailPreview}
                    alt="Selected thumbnail preview"
                    className="h-16 w-24 shrink-0 rounded-md object-cover"
                  />
                  <p className="text-xs text-[var(--nord-slate)]">
                    {thumbnailBlob
                      ? "New thumbnail selected — save to upload."
                      : "Current thumbnail"}
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="mt-4 flex h-[280px] items-center justify-center rounded-xl border border-dashed border-[var(--nord-hairline)] bg-[var(--nord-bg)]">
              {thumbnailPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumbnailPreview}
                  alt="Current thumbnail"
                  className="h-full w-full rounded-xl object-cover"
                />
              ) : (
                <p className="px-6 text-center text-sm text-[var(--nord-slate)]">
                  No thumbnail yet.
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
