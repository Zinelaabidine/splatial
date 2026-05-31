export type SceneCardState = "complete" | "draft" | "processing" | "preprocessing" | "uploaded" | "failed";

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
  /** Thumbnail accent for complete/processing cards. */
  thumbnailHue?: number;
};
