"use client";

import { authenticatedFetch } from "@/server/services/apiClient";
import type {
  DeleteSceneResponse,
  ListScenesV1Response,
  SceneStatusResponse,
  ThumbnailPresignResponse,
  UpdateSceneRequest,
  UpdateSceneResponse,
  ViewUrlResponse,
} from "@/types/api";

export async function listScenes(
  signal?: AbortSignal,
): Promise<ListScenesV1Response> {
  return authenticatedFetch("/api/v1/scenes", { signal }) as Promise<ListScenesV1Response>;
}

export async function deleteScene(
  sceneId: string,
  signal?: AbortSignal,
): Promise<DeleteSceneResponse> {
  return authenticatedFetch(`/api/v1/scenes/${sceneId}`, {
    method: "DELETE",
    signal,
  }) as Promise<DeleteSceneResponse>;
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

export async function updateScene(
  sceneId: string,
  body: UpdateSceneRequest,
  signal?: AbortSignal,
): Promise<UpdateSceneResponse> {
  return authenticatedFetch(`/api/v1/scenes/${sceneId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    signal,
  }) as Promise<UpdateSceneResponse>;
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
