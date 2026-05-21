/**
 * API contract for the 3D scene multipart upload flow.
 *
 * Endpoints (all prefixed by NEXT_PUBLIC_API_GATEWAY_URL):
 *   POST /upload/init      -> InitUploadResponse
 *   POST /upload/presign   -> PresignResponse
 *   PUT  <presigned S3 URL>
 *   POST /upload/complete  -> CompleteResponse
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
// Client-side UI state for the upload queue / right sidebar tracker
// ---------------------------------------------------------------------------
export type UploadStage =
  | "queued"
  | "initializing"
  | "presigning"
  | "uploading"
  | "completing"
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
