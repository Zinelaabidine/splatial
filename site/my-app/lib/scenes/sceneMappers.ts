import type { MockScene, SortOption } from "@/types/dashboard";
import type { Scene } from "@/types/api";

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
            ? "draft"
            : scene.status === "UPLOADED"
              ? "uploaded"
              : "preprocessing";

  return {
    id: scene.sceneId,
    sceneId: scene.sceneId,
    title: scene.name,
    state,
    createdAt: formatSceneDate(scene.createdAt),
    lastModified: formatSceneDate(scene.createdAt),
    thumbnailHue:
      state === "complete" || state === "processing"
        ? hueFromId(scene.sceneId)
        : undefined,
  };
}

export const SORT_LABELS: Record<SortOption, string> = {
  newest: "Newest",
  oldest: "Oldest",
  name: "Name",
};

export const POLL_INTERVAL_MS = 5_000;
