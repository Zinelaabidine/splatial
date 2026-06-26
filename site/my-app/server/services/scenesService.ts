"use client";

import { authenticatedFetch } from "@/server/services/apiClient";
import type {
  DeleteSceneResponse,
  ListScenesV1Response,
  SceneStatusResponse,
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
