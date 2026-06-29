"use client";

import { authenticatedFetch } from "@/services/apiClient";
import type {
  Profile,
  UpdateProfileRequest,
  UpdateProfileResponse,
  UsernameAvailableResponse,
} from "@/types/api";

export async function getMyProfile(signal?: AbortSignal): Promise<Profile> {
  return authenticatedFetch("/api/v1/profile/me", {
    signal,
  }) as Promise<Profile>;
}

export async function updateMyProfile(
  body: UpdateProfileRequest,
  signal?: AbortSignal,
): Promise<UpdateProfileResponse> {
  return authenticatedFetch("/api/v1/profile/me", {
    method: "PUT",
    body: JSON.stringify(body),
    signal,
  }) as Promise<UpdateProfileResponse>;
}

export async function getProfileByUsername(
  username: string,
  signal?: AbortSignal,
): Promise<Profile> {
  return authenticatedFetch(`/api/v1/profiles/${encodeURIComponent(username)}`, {
    signal,
  }) as Promise<Profile>;
}

export async function checkUsernameAvailable(
  username: string,
  signal?: AbortSignal,
): Promise<UsernameAvailableResponse> {
  return authenticatedFetch(
    `/api/v1/profile/username-available/${encodeURIComponent(username)}`,
    { signal },
  ) as Promise<UsernameAvailableResponse>;
}
