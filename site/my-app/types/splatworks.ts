/** Scene lifecycle per design handoff. */
export type SceneStatus =
  | "draft"
  | "queued"
  | "training"
  | "completed"
  | "failed";

export type SplatSubject =
  | "vase"
  | "fountain"
  | "interior"
  | "trail"
  | "desk"
  | "statue";

export type SplatPreviewTint = {
  /** Radial gradient tint for the point-cloud layer. */
  tintLayers: string[];
  /** Optional viewer-area base radial gradient. */
  baseGradient?: string;
  /** Dot grid size in px (default 6). */
  dotSize?: number;
};

export type SplatAuthor = {
  name: string;
  initials: string;
};

export type Splat = {
  id: string;
  /** Backend scene id when wired to API. */
  sceneId?: string;
  title: string;
  splatCount: number;
  fileSizeMb: number;
  createdAt: string;
  author: SplatAuthor;
  /** Visual subject for preview rendering. */
  subject: SplatSubject;
  preview: SplatPreviewTint;
  downloadUrls?: { ply?: string; splat?: string };
  shareLink?: string;
};

export type DashboardScene = {
  id: string;
  sceneId?: string;
  title: string;
  status: SceneStatus;
  /** Bottom caption line (mono, muted). */
  caption: string;
  preview?: SplatPreviewTint;
  splatCount?: number;
  fileSizeMb?: number;
  progressPercent?: number;
  currentIter?: string;
  eta?: string;
  queuePosition?: number;
  queueEta?: string;
  imageCount?: number;
  uploadedImageCount?: number;
  editedAt?: string;
  errorMessage?: string;
  failedAtIter?: string;
  failedAt?: string;
};

export type DashboardStats = {
  totalScenes: number;
  trainingNow: number;
  splatsReady: number;
  gpuHours: number;
};

export type UserAccount = {
  name: string;
  initials: string;
  plan: string;
};

export type SplatsSortOption = "newest" | "oldest" | "name";
export type SplatsViewMode = "grid" | "list";
