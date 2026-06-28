"use client";

import { fetchAuthSession } from "aws-amplify/auth";
import { useCallback, useEffect, useRef, useState } from "react";

import { getApiBaseUrl } from "@/api/baseUrl";
import { submitJob as submitSceneJob } from "@/services/jobsService";
import {
  deleteSceneLegacy,
  getSceneStatus,
} from "@/services/scenesService";
import {
  DEFAULT_PART_SIZE,
  multipartUpload,
} from "@/services/uploadService";
import type {
  CompleteResponse,
  SceneStatusResponse,
  UploadItem,
  UploadStage,
} from "@/types/api";

const HOOK_DEFAULT_CONCURRENCY = 6;
const FALLBACK_CONTENT_TYPE = "application/octet-stream";

// Scene-status polling: start at 3 s, back off up to 30 s, give up after 30 min.
const POLL_INITIAL_MS = 3_000;
const POLL_MAX_MS = 30_000;
const POLL_BACKOFF_FACTOR = 1.5;
const POLL_TIMEOUT_MS = 30 * 60 * 1000;

export interface UseMultipartUploadOptions {
  /** Bytes per part. Defaults to 5 MiB (S3 multipart minimum). */
  partSize?: number;
  /** Max parts uploaded in parallel per file. */
  concurrency?: number;
  onComplete?: (item: UploadItem, response: CompleteResponse) => void;
  onError?: (item: UploadItem, error: Error) => void;
}

export interface UseMultipartUploadResult {
  /** Live, ordered list of uploads (newest first). */
  uploads: UploadItem[];
  /** Push a file into the queue and start uploading immediately. */
  enqueue: (file: File) => UploadItem;
  /** Convenience helper for batched drops. */
  enqueueMany: (files: File[] | FileList) => UploadItem[];
  /** Abort an in-flight upload. */
  cancel: (id: string) => void;
  /** Remove a single upload row (does not abort — call `cancel` first). */
  remove: (id: string) => void;
  /** Drop every upload whose stage is `ready` / `failed` / `canceled`. */
  clearTerminated: () => void;
  /** Queue an uploaded scene for 3DGS processing. */
  submitJob: (id: string) => Promise<void>;
}

const TERMINAL_STAGES: ReadonlySet<UploadStage> = new Set([
  "uploaded",
  "ready",
  "failed",
  "canceled",
]);

function inferContentType(file: File): string {
  if (file.type) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith(".glb")) return "model/gltf-binary";
  if (name.endsWith(".gltf")) return "model/gltf+json";
  if (name.endsWith(".ply")) return "application/octet-stream";
  if (name.endsWith(".splat")) return "application/octet-stream";
  if (name.endsWith(".obj")) return "text/plain";
  return FALLBACK_CONTENT_TYPE;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `up_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Drives the four-step S3 multipart upload flow:
 *
 *   A. POST /upload/init       → { uploadId, key, sceneId }
 *   B. POST /upload/presign    → { parts: [{ partNumber, url }] }
 *   C. PUT  <presigned URL>    × N parts (Promise.all, bounded by `concurrency`)
 *   D. POST /upload/complete   → { sceneId, status, location }
 *
 * Each upload is tracked as an `UploadItem` in `uploads`, suitable for direct
 * consumption by the right-sidebar queue tracker in Phase 3.
 */
export function useMultipartUpload(
  options: UseMultipartUploadOptions = {},
): UseMultipartUploadResult {
  const [uploads, setUploads] = useState<UploadItem[]>([]);

  // Latest options live in a ref so async pipelines don't capture stale closures.
  const optsRef = useRef(options);
  useEffect(() => {
    optsRef.current = options;
  }, [options]);

  // Active AbortControllers keyed by upload id. Lets `cancel()` reach into
  // in-flight fetches even after re-renders.
  const controllersRef = useRef<Map<string, AbortController>>(new Map());

  // Cached JWT token — refreshed at the start of each upload so the synchronous
  // `pagehide` handler can fire keepalive DELETEs without an async token fetch.
  const tokenRef = useRef<string | null>(null);

  // Sync mirror of `uploads` state for safe access inside event handlers
  // that run outside React's render cycle (pagehide).
  const uploadsRef = useRef<UploadItem[]>([]);
  useEffect(() => {
    uploadsRef.current = uploads;
  }, [uploads]);

  // ---------------------------------------------------------------------------
  // Scene cleanup helper — fire-and-forget DELETE /scenes/{sceneId}.
  // Called when the user cancels or removes an upload that already has a
  // sceneId registered in DynamoDB (i.e. /upload/init succeeded).
  // ---------------------------------------------------------------------------
  const deleteScene = useCallback((sceneId: string) => {
    void deleteSceneLegacy(sceneId).catch(() => {
      // Best-effort: backend TTL will clean up within 24 h if this fails.
    });
  }, []);

  // ---------------------------------------------------------------------------
  // pagehide — fires when the tab is closed, navigated away, or put in the
  // bfcache. Use keepalive fetch so the request outlives the page.
  // Regular fetch / authenticatedFetch are async; we use the cached token
  // so this handler stays synchronous (required by the browser).
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handler = () => {
      const token = tokenRef.current;
      let base: string;
      try {
        base = getApiBaseUrl();
      } catch {
        return;
      }
      if (!token || !base) return;

      for (const item of uploadsRef.current) {
        if (item.sceneId && !TERMINAL_STAGES.has(item.stage)) {
          void fetch(`${base}/scenes/${item.sceneId}`, {
            method: "DELETE",
            keepalive: true,
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
          });
        }
      }
    };

    window.addEventListener("pagehide", handler);
    return () => window.removeEventListener("pagehide", handler);
  }, []);

  // Tear down any in-flight uploads if the component unmounts mid-flow.
  useEffect(() => {
    const controllers = controllersRef.current;
    return () => {
      controllers.forEach((c) => c.abort());
      controllers.clear();
    };
  }, []);

  const patch = useCallback(
    (
      id: string,
      delta:
        | Partial<UploadItem>
        | ((prev: UploadItem) => Partial<UploadItem>),
    ) => {
      setUploads((prev) =>
        prev.map((u) => {
          if (u.id !== id) return u;
          const next = typeof delta === "function" ? delta(u) : delta;
          return { ...u, ...next };
        }),
      );
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Pipeline
  // ---------------------------------------------------------------------------
  const pollScene = useCallback(
    async (id: string, sceneId: string, controller: AbortController): Promise<void> => {
      const isAborted = () => controller.signal.aborted;
      const pollStart = Date.now();
      let interval = POLL_INITIAL_MS;

      while (!isAborted() && Date.now() - pollStart < POLL_TIMEOUT_MS) {
        await new Promise<void>((resolve) => setTimeout(resolve, interval));
        interval = Math.min(interval * POLL_BACKOFF_FACTOR, POLL_MAX_MS);

        if (isAborted()) break;

        const statusResp = (await getSceneStatus(
          sceneId,
          controller.signal,
        )) as SceneStatusResponse;

        if (statusResp.status === "READY" || statusResp.status === "FAILED") {
          patch(id, {
            stage: statusResp.status === "READY" ? "ready" : "failed",
            finishedAt: Date.now(),
            ...(statusResp.location && { location: statusResp.location }),
          });
          break;
        }
      }
    },
    [patch],
  );

  const runUpload = useCallback(
    async (seed: UploadItem, file: File): Promise<void> => {
      const {
        partSize = DEFAULT_PART_SIZE,
        concurrency = HOOK_DEFAULT_CONCURRENCY,
        onComplete,
        onError,
      } = optsRef.current;

      const controller = new AbortController();
      controllersRef.current.set(seed.id, controller);

      const isAborted = () => controller.signal.aborted;
      const throwIfAborted = () => {
        if (isAborted()) throw new DOMException("Upload canceled", "AbortError");
      };

      try {
        // Cache the JWT token so the synchronous pagehide handler can use it
        // for keepalive DELETEs. Amplify returns a cached session — no round trip.
        try {
          const session = await fetchAuthSession();
          const t = session.tokens?.idToken?.toString();
          if (t) tokenRef.current = t;
        } catch {
          // Non-fatal: upload proceeds; pagehide fallback just won't have token.
        }

        const partCount = Math.max(1, Math.ceil(file.size / partSize));
        patch(seed.id, { partCount });

        const { complete } = await multipartUpload({
          file,
          contentType: seed.contentType,
          partSize,
          concurrency,
          signal: controller.signal,
          onProgress: (uploadStage, uploadProgress, meta) => {
            patch(seed.id, {
              stage: uploadStage,
              ...(meta?.sceneId ? { sceneId: meta.sceneId } : {}),
              ...(uploadStage === "uploading" && uploadProgress !== undefined
                ? { progress: uploadProgress }
                : uploadStage === "uploading"
                  ? { progress: 0 }
                  : {}),
            });
          },
        });

        throwIfAborted();

        const initialStage: UploadStage =
          complete.status === "READY"
            ? "ready"
            : complete.status === "FAILED"
              ? "failed"
              : complete.status === "UPLOADED"
                ? "uploaded"
                : "processing";

        patch(seed.id, {
          stage: initialStage,
          progress: 100,
          location: complete.location ?? undefined,
          sceneId: complete.sceneId,
          ...(initialStage !== "processing" && { finishedAt: Date.now() }),
        });

        onComplete?.(
          {
            ...seed,
            stage: initialStage,
            progress: 100,
            location: complete.location ?? undefined,
            sceneId: complete.sceneId,
          },
          complete,
        );

        // -------------------------------------------------------------------
        // Step E — Poll for processing completion (PROCESSING → READY/FAILED)
        // -------------------------------------------------------------------
        if (initialStage === "processing") {
          await pollScene(seed.id, complete.sceneId, controller);
        }
      } catch (err) {
        const aborted =
          isAborted() || (err instanceof Error && err.name === "AbortError");
        const error = err instanceof Error ? err : new Error(String(err));
        const stage: UploadStage = aborted ? "canceled" : "failed";
        const finishedAt = Date.now();

        patch(seed.id, {
          stage,
          error: aborted ? undefined : error.message,
          finishedAt,
        });

        if (!aborted) {
          onError?.(
            { ...seed, stage, error: error.message, finishedAt },
            error,
          );
        }
      } finally {
        controllersRef.current.delete(seed.id);
      }
    },
    [patch, pollScene],
  );

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  const enqueue = useCallback(
    (file: File): UploadItem => {
      if (file.size <= 0) {
        const failed: UploadItem = {
          id: newId(),
          filename: file.name,
          size: file.size,
          contentType: inferContentType(file),
          stage: "failed",
          progress: 0,
          error: "File is empty.",
          startedAt: Date.now(),
          finishedAt: Date.now(),
        };
        setUploads((prev) => [failed, ...prev]);
        return failed;
      }

      const item: UploadItem = {
        id: newId(),
        filename: file.name,
        size: file.size,
        contentType: inferContentType(file),
        stage: "queued",
        progress: 0,
        startedAt: Date.now(),
      };

      setUploads((prev) => [item, ...prev]);
      void runUpload(item, file);
      return item;
    },
    [runUpload],
  );

  const enqueueMany = useCallback(
    (files: File[] | FileList): UploadItem[] => {
      const arr = Array.from(files);
      return arr.map((f) => enqueue(f));
    },
    [enqueue],
  );

  const cancel = useCallback(
    (id: string) => {
      controllersRef.current.get(id)?.abort();
      // Clean up the DynamoDB record so it doesn't linger in PENDING_UPLOAD
      // and eat into the quota. The AbortController above cancels the S3 PUTs;
      // this call removes the scene row the backend already created.
      const sceneId = uploadsRef.current.find((u) => u.id === id)?.sceneId;
      if (sceneId) deleteScene(sceneId);
    },
    [deleteScene],
  );

  const remove = useCallback(
    (id: string) => {
      controllersRef.current.get(id)?.abort();
      controllersRef.current.delete(id);
      // Delete the backend record for any stage that hasn't reached a clean
      // terminal state yet (ready scenes stay in S3 intentionally).
      const item = uploadsRef.current.find((u) => u.id === id);
      if (item?.sceneId && item.stage !== "ready" && item.stage !== "uploaded") deleteScene(item.sceneId);
      setUploads((prev) => prev.filter((u) => u.id !== id));
    },
    [deleteScene],
  );

  const submitJob = useCallback(
    async (id: string): Promise<void> => {
      const item = uploadsRef.current.find((u) => u.id === id);
      if (!item?.sceneId) return;

      const controller = new AbortController();
      controllersRef.current.set(id, controller);

      patch(id, { stage: "processing", error: undefined });

      try {
        await submitSceneJob(item.sceneId, controller.signal);

        await pollScene(id, item.sceneId, controller);
      } catch (err) {
        const aborted =
          controller.signal.aborted ||
          (err instanceof Error && err.name === "AbortError");
        if (!aborted) {
          patch(id, {
            stage: "uploaded",
            error: err instanceof Error ? err.message : "Submit failed",
          });
        }
      } finally {
        controllersRef.current.delete(id);
      }
    },
    [patch, pollScene],
  );

  const clearTerminated = useCallback(() => {
    setUploads((prev) => prev.filter((u) => !TERMINAL_STAGES.has(u.stage)));
  }, []);

  return { uploads, enqueue, enqueueMany, cancel, remove, clearTerminated, submitJob };
}
