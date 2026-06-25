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
// Step E: Poll scene processing status
// ---------------------------------------------------------------------------
export interface SceneStatusResponse {
  sceneId: string;
  status: SceneStatus;
  location: string | null;
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

export interface Scene {
  sceneId: string;
  name: string;
  inputType: InputType;
  status: SceneManagementStatus;
  createdAt: string;
  /** S3 key in the splat-scenes bucket — present when the scene is READY. */
  plyKey?: string;
  /** 0–100 while status is PROCESSING (updated by worker PATCH / heartbeat). */
  progressPercent?: number;
  progressPhase?: string;
}

export interface CreateSceneRequest {
  name: string;
  inputType: InputType;
}

export interface ListScenesV1Response {
  scenes: Scene[];
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
