/**
 * API contract for the 3D scene multipart upload flow.
 *
 * Endpoints (all prefixed by NEXT_PUBLIC_API_GATEWAY_URL):
 *   POST /upload/init         -> InitUploadResponse
 *   POST /upload/presign      -> PresignResponse
 *   PUT  <presigned S3 URL>
 *   POST /upload/complete     -> CompleteResponse
 *   GET  /scenes/{sceneId}    -> SceneStatusResponse
 */

// ---------------------------------------------------------------------------
// Step A: Initialize multipart upload
// ---------------------------------------------------------------------------
export interface InitUploadRequest {
  filename: string;
  contentType: string;
}

export interface InitUploadResponse {
  uploadId: string;
  key: string;
  sceneId: string;
}

// ---------------------------------------------------------------------------
// Step B: Presign part URLs
// ---------------------------------------------------------------------------
export interface PresignRequest {
  uploadId: string;
  key: string;
  partCount: number;
}

export interface PresignedPart {
  partNumber: number;
  url: string;
}

export interface PresignResponse {
  parts: PresignedPart[];
  /** Seconds until the presigned URLs expire. */
  expiresIn: number;
}

// ---------------------------------------------------------------------------
// Step C: Direct S3 PUT result (client-side tracking only)
// ---------------------------------------------------------------------------
export interface CompletedPart {
  partNumber: number;
  eTag: string;
}

// ---------------------------------------------------------------------------
// Step D: Complete multipart upload
// ---------------------------------------------------------------------------
export interface CompleteRequest {
  uploadId: string;
  key: string;
  sceneId: string;
  parts: CompletedPart[];
}

export type SceneStatus =
  | "UPLOADED"
  | "PROCESSING"
  | "READY"
  | "FAILED";

export interface CompleteResponse {
  sceneId: string;
  status: SceneStatus;
  /** S3 object URL or canonical location of the assembled object. */
  location: string;
}

// ---------------------------------------------------------------------------
// Scene reactions
// ---------------------------------------------------------------------------
export type ReactionType = "like" | "love" | "wow" | "fire" | "haha";

export type ReactionCounts = Record<ReactionType, number>;

export interface ReactionSummary {
  reactionCounts: ReactionCounts;
  reactionsTotal: number;
  myReaction: ReactionType | null;
}

// ---------------------------------------------------------------------------
// Step E: Poll scene processing status
// ---------------------------------------------------------------------------
export interface SceneStatusResponse {
  sceneId: string;
  status: SceneManagementStatus;
  location: string | null;
  visibility?: SceneVisibility;
  reactionCounts?: ReactionCounts;
  reactionsTotal?: number;
  myReaction?: ReactionType | null;
  commentsCount?: number;
  isBookmarked?: boolean;
}

// ---------------------------------------------------------------------------
// Scene comments
// ---------------------------------------------------------------------------
export interface Comment {
  commentId: string;
  sceneId: string;
  userId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatarUrl?: string | null;
  body: string;
  /** Lowercase handles the backend resolved from @mentions in `body`. */
  mentions?: string[];
  createdAt: string;
}

export interface CommentsResponse {
  comments: Comment[];
  nextCursor?: string;
}

export interface DeleteCommentResponse {
  ok: true;
  commentsCount: number;
}

// ---------------------------------------------------------------------------
// Client-side UI state for the upload queue / right sidebar tracker
// ---------------------------------------------------------------------------
export type UploadStage =
  | "queued"
  | "initializing"
  | "presigning"
  | "uploading"
  | "completing"
  | "uploaded"
  | "processing"
  | "ready"
  | "failed"
  | "canceled";

export interface UploadItem {
  /** Stable client-side id (e.g. crypto.randomUUID()). */
  id: string;
  /** Returned by /upload/init once the backend has registered the scene. */
  sceneId?: string;
  filename: string;
  /** Bytes. */
  size: number;
  contentType: string;
  stage: UploadStage;
  /** 0–100, derived from parts completed. */
  progress: number;
  /** Number of 5MB parts the file was sliced into. */
  partCount?: number;
  /** Final S3 location once `complete` succeeds. */
  location?: string;
  /** Thumbnail or preview URL once the processing pipeline produces one. */
  thumbnailUrl?: string;
  /** Human-readable error message if `stage === "failed"`. */
  error?: string;
  /** Epoch ms when the upload was first enqueued. */
  startedAt: number;
  /** Epoch ms when the upload terminated (ready / failed / canceled). */
  finishedAt?: number;
}

// ---------------------------------------------------------------------------
// Scene Management MVP  (POST/GET/DELETE /api/v1/scenes)
// ---------------------------------------------------------------------------
export type InputType = "video" | "images" | "ply";

export type SceneManagementStatus = "PENDING_UPLOAD" | "UPLOADED" | "QUEUED" | "PROCESSING" | "READY" | "FAILED" | "CANCELLED";

export type SceneVisibility = "PUBLIC" | "PRIVATE";

export interface Scene {
  sceneId: string;
  name: string;
  inputType: InputType;
  status: SceneManagementStatus;
  /** Public scenes appear on explore/feed; missing values are treated as PRIVATE. */
  visibility: SceneVisibility;
  /** Taxonomy category when set; null when uncategorized. */
  category?: string | null;
  /** Lowercase slug tags for discovery (max 10). */
  tags?: string[];
  createdAt: string;
  /** S3 key in the splat-scenes bucket — present when the scene is READY. */
  plyKey?: string;
  /** S3 key for a user-set JPEG thumbnail alongside the splat output. */
  thumbnailKey?: string;
  /** Presigned GET URL for thumbnailKey (refreshed on each list/update). */
  thumbnailUrl?: string;
  /** 0–100 while status is PROCESSING (updated by worker PATCH / heartbeat). */
  progressPercent?: number;
  progressPhase?: string;
  /** COLMAP sub-step while progressPhase is COLMAP (e.g. COLMAP_FEATURE). */
  progressSubPhase?: string;
  /** Estimated seconds remaining for the current phase (worker-reported). */
  progressEtaSeconds?: number;
  /** Per-type reaction counts (denormalized on list/feed responses). */
  reactionCounts?: ReactionCounts;
  /** Total reactions across all types. */
  reactionsTotal?: number;
  /** Denormalized comment count on list/feed responses. */
  commentsCount?: number;
}

export interface CreateSceneRequest {
  name: string;
  inputType: InputType;
}

export interface ListScenesV1Response {
  scenes: Scene[];
}

export interface ProfileScenesResponse {
  scenes: Scene[];
  nextCursor?: string;
}

/** Scene in the personalized feed, with denormalized owner profile fields. */
export type FeedScene = Scene & {
  ownerUsername: string;
  ownerDisplayName: string;
  ownerAvatarUrl?: string | null;
};

export interface FeedResponse {
  scenes: FeedScene[];
  nextCursor?: string;
}

/** Newest public scenes (explore); same item shape as the personalized feed. */
export interface ExploreResponse {
  scenes: FeedScene[];
  nextCursor?: string;
}

/** Caller's saved scenes, newest first. */
export interface BookmarksResponse {
  scenes: FeedScene[];
  nextCursor?: string;
}

export interface DeleteSceneResponse {
  sceneId: string;
  deleted: true;
  /** True when an in-flight job was marked CANCELLED before cleanup. */
  cancelledJob?: boolean;
}

/** Worker callback: PATCH /api/attempts/:attemptId */
export interface AttemptPatchResponse {
  attemptId: string;
  updated: boolean;
  skipped?: boolean;
  reason?: "CANCELLED";
}

export interface CancelJobResponse {
  sceneId: string;
  status: "CANCELLED";
}

export interface UpdateSceneRequest {
  name?: string;
  thumbnailKey?: string;
  visibility?: SceneVisibility;
  category?: string | null;
  tags?: string[];
}

export type UpdateSceneResponse = Scene;

export interface ThumbnailPresignResponse {
  sceneId: string;
  key: string;
  uploadUrl: string;
  contentType: string;
  expiresIn: number;
}

// ---------------------------------------------------------------------------
// Seed a READY scene for a manually-uploaded PLY file
// ---------------------------------------------------------------------------
export interface SeedSceneRequest {
  name: string;
}

export interface SeedSceneResponse {
  sceneId: string;
  name: string;
  status: "READY";
  /** S3 bucket name to upload the PLY file to. */
  plyBucket: string;
  /** S3 key to use for the PLY file: splat-scenes/<userId>/<sceneId>/scene.ply */
  plyKey: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// View URL for the Gaussian Splat viewer
// ---------------------------------------------------------------------------
export interface ViewUrlResponse {
  sceneId: string;
  /** Presigned S3 GET URL, valid for 1 hour. */
  url: string;
  expiresIn: number;
}

// ---------------------------------------------------------------------------
// Google Drive import
// ---------------------------------------------------------------------------
export interface GdriveImportRequest {
  /** Public Google Drive share link for a ZIP file. */
  gdrive_url: string;
  /** Optional display name for the scene. Defaults to the Drive file ID. */
  name?: string;
}

export interface GdriveImportResponse {
  sceneId: string;
  /** Always "PENDING_UPLOAD" — poll GET /scenes/{sceneId} for progress. */
  status: "PENDING_UPLOAD";
}

// ---------------------------------------------------------------------------
// Scene listing (used by RightSidebar "Recent outputs")
// ---------------------------------------------------------------------------
export interface SceneSummary {
  sceneId: string;
  filename: string;
  status: SceneStatus;
  thumbnailUrl?: string;
  location?: string;
  createdAt: string;
}

export interface ListScenesResponse {
  scenes: SceneSummary[];
  nextCursor?: string;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
export type NotificationType = "FOLLOW" | "REACTION" | "COMMENT" | "MENTION";

export interface AppNotification {
  notificationId: string;
  type: NotificationType;
  actorUsername: string;
  actorDisplayName: string;
  actorAvatarUrl?: string | null;
  sceneId?: string;
  commentId?: string;
  reactionType?: string;
  createdAt: string;
  read: boolean;
}

export interface NotificationsResponse {
  notifications: AppNotification[];
  unreadCount: number;
  nextCursor?: string;
}

export interface UnreadCountResponse {
  unreadCount: number;
}

export interface MarkAllNotificationsReadResponse {
  unreadCount: 0;
}

export type {
  FollowResponse,
  Profile,
  UpdateProfileRequest,
  UpdateProfileResponse,
  UsernameAvailableResponse,
} from "./profile";
export {
  USERNAME_HINT,
  USERNAME_PATTERN,
  isValidUsernameFormat,
  normalizeUsernameInput,
} from "./profile";
