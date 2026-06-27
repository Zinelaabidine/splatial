import type { SceneManagementStatus } from "@/types/api";

export type SceneCardState =
  | "complete"
  | "draft"
  | "processing"
  | "preprocessing"
  | "uploaded"
  | "failed"
  | "cancelled";

export type SortOption = "newest" | "oldest" | "name";

export type AppMode = "dashboard" | "viewer" | "profile" | "admin";

export type MockScene = {
  id: string;
  /** Real backend sceneId — present for API-sourced scenes; used for viewer navigation. */
  sceneId?: string;
  title: string;
  state: SceneCardState;
  createdAt: string;
  lastModified: string;
  /** 0–100, only used when state is "processing". */
  processingProgress?: number;
  /** Worker phase label while processing. */
  processingPhase?: string;
  /** COLMAP sub-step or other granular step label. */
  processingSubPhase?: string;
  /** Human-readable ETA while processing (e.g. "8m"). */
  processingEta?: string;
  /** Thumbnail accent for complete/processing cards. */
  thumbnailHue?: number;
  /** Original API status when mapped from listScenes. */
  apiStatus?: SceneManagementStatus;
};
