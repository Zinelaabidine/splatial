"use client";

import { authenticatedFetch } from "@/services/apiClient";
import type {
  DeleteSceneResponse,
  EditPresignResponse,
  ListScenesV1Response,
  Scene,
  SceneDownloadResponse,
  SceneStatusResponse,
  ThumbnailPresignResponse,
  UpdateSceneRequest,
  UpdateSceneResponse,
  ViewUrlResponse,
} from "@/types/api";

// ---------------------------------------------------------------------------
// listScenes request de-duplication + short-TTL cache
//
// On initial page load the dashboard grid, the top-bar TrainingMenu
// (useJobStatusSummary) and the ActivityMenu each independently call
// GET /api/v1/scenes, producing 3 identical in-flight requests. This layer
// collapses concurrent/near-simultaneous callers onto a single network request
// and briefly caches the result, mirroring the shared-session pattern in
// apiClient. Any mutation invalidates the cache so refreshes stay correct.
// ---------------------------------------------------------------------------
const LIST_SCENES_TTL_MS = 3_000;

let listScenesCache: { data: ListScenesV1Response; at: number } | null = null;
let listScenesInFlight: Promise<ListScenesV1Response> | null = null;

/** Drop any cached/in-flight scenes list so the next listScenes() hits the network. */
export function invalidateScenesCache(): void {
  listScenesCache = null;
  listScenesInFlight = null;
}

function fetchScenesShared(): Promise<ListScenesV1Response> {
  if (listScenesInFlight) return listScenesInFlight;
  // Note: deliberately no per-caller AbortSignal here — the shared request must
  // survive one caller unmounting/aborting so the others still receive data.
  listScenesInFlight = (
    authenticatedFetch("/api/v1/scenes") as Promise<ListScenesV1Response>
  )
    .then((data) => {
      listScenesCache = { data, at: Date.now() };
      return data;
    })
    .finally(() => {
      listScenesInFlight = null;
    });
  return listScenesInFlight;
}

export async function listScenes(
  signal?: AbortSignal,
): Promise<ListScenesV1Response> {
  if (listScenesCache && Date.now() - listScenesCache.at < LIST_SCENES_TTL_MS) {
    return listScenesCache.data;
  }

  const shared = fetchScenesShared();
  if (!signal) return shared;

  // Honour this caller's AbortSignal without cancelling the shared request.
  return new Promise<ListScenesV1Response>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    shared.then(
      (data) => {
        signal.removeEventListener("abort", onAbort);
        resolve(data);
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      },
    );
  });
}

export async function deleteScene(
  sceneId: string,
  signal?: AbortSignal,
): Promise<DeleteSceneResponse> {
  const result = (await authenticatedFetch(`/api/v1/scenes/${sceneId}`, {
    method: "DELETE",
    signal,
  })) as DeleteSceneResponse;
  invalidateScenesCache();
  return result;
}

export async function deleteSceneLegacy(
  sceneId: string,
  signal?: AbortSignal,
): Promise<void> {
  await authenticatedFetch(`/scenes/${sceneId}`, {
    method: "DELETE",
    signal,
  });
}

export async function getSceneStatus(
  sceneId: string,
  signal?: AbortSignal,
): Promise<SceneStatusResponse> {
  return authenticatedFetch(`/scenes/${sceneId}`, {
    signal,
  }) as Promise<SceneStatusResponse>;
}

export async function getSceneViewUrl(
  sceneId: string,
  signal?: AbortSignal,
): Promise<ViewUrlResponse> {
  return authenticatedFetch(`/api/v1/scenes/${sceneId}/view-url`, {
    signal,
  }) as Promise<ViewUrlResponse>;
}

export async function getSceneDownloadRaw(
  sceneId: string,
  signal?: AbortSignal,
): Promise<SceneDownloadResponse> {
  return authenticatedFetch(`/api/v1/scenes/${sceneId}/download/raw`, {
    signal,
  }) as Promise<SceneDownloadResponse>;
}

export async function getSceneDownloadOutput(
  sceneId: string,
  signal?: AbortSignal,
): Promise<SceneDownloadResponse> {
  return authenticatedFetch(`/api/v1/scenes/${sceneId}/download/output`, {
    signal,
  }) as Promise<SceneDownloadResponse>;
}

export async function updateScene(
  sceneId: string,
  body: UpdateSceneRequest,
  signal?: AbortSignal,
): Promise<UpdateSceneResponse> {
  const result = (await authenticatedFetch(`/api/v1/scenes/${sceneId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    signal,
  })) as UpdateSceneResponse;
  invalidateScenesCache();
  return result;
}

export async function forkScene(
  sceneId: string,
  name?: string,
  signal?: AbortSignal,
): Promise<Scene> {
  const body = name !== undefined ? JSON.stringify({ name }) : undefined;
  const result = (await authenticatedFetch(`/api/v1/scenes/${sceneId}/fork`, {
    method: "POST",
    ...(body ? { body } : {}),
    signal,
  })) as Scene;
  invalidateScenesCache();
  return result;
}

export async function presignSceneEdit(
  sceneId: string,
  signal?: AbortSignal,
): Promise<EditPresignResponse> {
  return authenticatedFetch(`/api/v1/scenes/${sceneId}/edit/presign`, {
    method: "POST",
    signal,
  }) as Promise<EditPresignResponse>;
}

export async function completeSceneEdit(
  sceneId: string,
  key: string,
  signal?: AbortSignal,
): Promise<Scene> {
  const result = (await authenticatedFetch(`/api/v1/scenes/${sceneId}/edit/complete`, {
    method: "POST",
    body: JSON.stringify({ key }),
    signal,
  })) as Scene;
  invalidateScenesCache();
  return result;
}

export async function presignSceneThumbnail(
  sceneId: string,
  signal?: AbortSignal,
): Promise<ThumbnailPresignResponse> {
  return authenticatedFetch(`/api/v1/scenes/${sceneId}/thumbnail/presign`, {
    method: "POST",
    signal,
  }) as Promise<ThumbnailPresignResponse>;
}

export async function uploadThumbnailToS3(
  uploadUrl: string,
  blob: Blob,
  contentType: string,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
    signal,
  });
  if (!response.ok) {
    throw new Error(`Thumbnail upload failed (${response.status})`);
  }
}
