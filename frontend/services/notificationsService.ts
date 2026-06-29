"use client";

import { authenticatedFetch } from "@/services/apiClient";
import type {
  MarkAllNotificationsReadResponse,
  NotificationsResponse,
  UnreadCountResponse,
} from "@/types/api";

export async function getNotifications(
  cursor?: string,
  signal?: AbortSignal,
): Promise<NotificationsResponse> {
  const base = "/api/v1/notifications";
  const path =
    cursor != null && cursor !== ""
      ? `${base}?cursor=${encodeURIComponent(cursor)}`
      : base;
  return authenticatedFetch(path, { signal }) as Promise<NotificationsResponse>;
}

export async function markAllNotificationsRead(
  signal?: AbortSignal,
): Promise<MarkAllNotificationsReadResponse> {
  return authenticatedFetch("/api/v1/notifications/read", {
    method: "POST",
    signal,
  }) as Promise<MarkAllNotificationsReadResponse>;
}

export async function getUnreadCount(
  signal?: AbortSignal,
): Promise<UnreadCountResponse> {
  return authenticatedFetch("/api/v1/notifications/unread-count", {
    signal,
  }) as Promise<UnreadCountResponse>;
}
