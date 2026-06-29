import type { MockScene, SortOption } from "@/types/dashboard";
import type { Scene } from "@/types/api";
import type { DashboardScene, SceneStatus } from "@/types/splatworks";
import {
  formatEtaSeconds,
  formatProgressPhase,
  formatProgressSubPhase,
  processingStatusCaption,
} from "@/lib/scenes/progressLabels";

/** Deterministic pastel hue derived from a scene ID string. */
export function hueFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  return h % 360;
}

export function formatSceneDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const ACTIVE_GPU_JOB_STATUSES = new Set<Scene["status"]>(["QUEUED", "PROCESSING"]);

/** Scene is waiting on or running GPU training. */
export function isActiveGpuJobStatus(status: Scene["status"] | undefined): boolean {
  return status != null && ACTIVE_GPU_JOB_STATUSES.has(status);
}

/** Map API Scene → UI card model. */
export function apiSceneToCard(scene: Scene): MockScene {
  const state =
    scene.status === "READY"
      ? "complete"
      : scene.status === "PROCESSING"
        ? "processing"
        : scene.status === "FAILED"
          ? "failed"
          : scene.status === "CANCELLED"
            ? "cancelled"
            : scene.status === "UPLOADED"
              ? "uploaded"
              : scene.status === "QUEUED" || scene.status === "PENDING_UPLOAD"
                ? "preprocessing"
                : "draft";

  return {
    id: scene.sceneId,
    sceneId: scene.sceneId,
    title: scene.name,
    state,
    apiStatus: scene.status,
    createdAt: formatSceneDate(scene.createdAt),
    lastModified: formatSceneDate(scene.createdAt),
    ...(scene.progressPercent != null
      ? { processingProgress: scene.progressPercent }
      : {}),
    ...(scene.progressPhase
      ? { processingPhase: formatProgressPhase(scene.progressPhase) }
      : {}),
    ...(scene.progressSubPhase
      ? { processingSubPhase: formatProgressSubPhase(scene.progressSubPhase) }
      : {}),
    ...(scene.progressEtaSeconds != null
      ? { processingEta: formatEtaSeconds(scene.progressEtaSeconds) }
      : {}),
    thumbnailHue:
      state === "complete" || state === "processing"
        ? hueFromId(scene.sceneId)
        : undefined,
  };
}

function apiStatusToDashboardStatus(status: Scene["status"]): SceneStatus {
  switch (status) {
    case "READY":
      return "completed";
    case "PROCESSING":
      return "training";
    case "QUEUED":
      return "queued";
    case "FAILED":
      return "failed";
    case "PENDING_UPLOAD":
      return "draft";
    case "UPLOADED":
      return "draft";
    case "CANCELLED":
      return "draft";
    default:
      return "draft";
  }
}

function dashboardCaption(scene: Scene, status: SceneStatus): string {
  const created = formatSceneDate(scene.createdAt);
  switch (status) {
    case "completed":
      return created;
    case "training":
      return processingStatusCaption(scene.progressPhase, scene.progressSubPhase);
    case "queued":
      return "In queue";
    case "failed":
      return "Processing failed";
    case "draft":
      if (scene.status === "CANCELLED") return "Cancelled";
      if (scene.status === "UPLOADED") return "Ready to submit";
      if (scene.status === "PENDING_UPLOAD") return "Importing…";
      return created;
  }
}

/** Map API Scene → Splatworks dashboard card model. */
export function apiSceneToDashboardScene(scene: Scene): DashboardScene {
  const status = apiStatusToDashboardStatus(scene.status);
  const card: DashboardScene = {
    id: scene.sceneId,
    sceneId: scene.sceneId,
    title: scene.name,
    status,
    apiStatus: scene.status,
    visibility: scene.visibility ?? "PRIVATE",
    category: scene.category ?? null,
    tags: scene.tags ?? [],
    caption: dashboardCaption(scene, status),
    ...(scene.thumbnailUrl ? { thumbnailUrl: scene.thumbnailUrl } : {}),
    ...(scene.progressPercent != null
      ? { progressPercent: scene.progressPercent }
      : {}),
    ...(scene.progressPhase ? { progressPhase: scene.progressPhase } : {}),
    ...(scene.progressSubPhase ? { progressSubPhase: scene.progressSubPhase } : {}),
    ...(scene.progressEtaSeconds != null
      ? { eta: formatEtaSeconds(scene.progressEtaSeconds) }
      : {}),
    ...(scene.reactionCounts ? { reactionCounts: scene.reactionCounts } : {}),
    ...(scene.reactionsTotal != null ? { reactionsTotal: scene.reactionsTotal } : {}),
  };

  if (status === "completed") {
    const hue = hueFromId(scene.sceneId);
    if (!scene.thumbnailUrl) {
      card.preview = {
        tintLayers: [`hsla(${hue}, 70%, 65%, 0.55)`],
        dotSize: 5,
      };
    }
  }

  return card;
}

export const SORT_LABELS: Record<SortOption, string> = {
  newest: "Newest",
  oldest: "Oldest",
  name: "Name",
};

export const POLL_INTERVAL_MS = 5_000;

const ACTIVE_API_STATUSES = new Set<Scene["status"]>([
  "PENDING_UPLOAD",
  "QUEUED",
  "PROCESSING",
]);

/** Whether a scene should trigger dashboard polling. */
export function isActiveSceneStatus(status: Scene["status"]): boolean {
  return ACTIVE_API_STATUSES.has(status);
}
