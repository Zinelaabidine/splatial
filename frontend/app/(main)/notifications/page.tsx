"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import NotificationRow from "@/components/notifications/NotificationRow";
import { Button } from "@/components/ui/button";
import { useNotificationsBadge } from "@/hooks/notifications/useNotificationsBadge";
import { ApiRequestError } from "@/lib/api/apiErrors";
import {
  getNotifications,
  markAllNotificationsRead,
} from "@/services/notificationsService";
import type { AppNotification } from "@/types/api";

function NotificationListSkeleton() {
  return (
    <div className="flex flex-col gap-1">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex animate-pulse gap-3 rounded-xl px-3 py-3"
        >
          <div className="h-10 w-10 shrink-0 rounded-full bg-[#2a2a2a]" />
          <div className="min-w-0 flex-1 space-y-2 pt-1">
            <div className="h-3.5 w-4/5 rounded bg-[#2a2a2a]" />
            <div className="h-2.5 w-1/4 rounded bg-[#252525]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function NotificationsPage() {
  const { clearUnreadCount, refreshUnreadCount } = useNotificationsBadge();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const markedReadRef = useRef(false);

  const fetchInitial = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError(null);
    setLoadMoreError(null);
    setItems([]);
    setNextCursor(undefined);
    markedReadRef.current = false;

    try {
      const res = await getNotifications(undefined, signal);
      if (signal.aborted) return;

      setItems(res.notifications ?? []);
      setNextCursor(res.nextCursor);

      if (!markedReadRef.current) {
        markedReadRef.current = true;
        try {
          await markAllNotificationsRead(signal);
          if (signal.aborted) return;
          clearUnreadCount();
          setItems((prev) => prev.map((n) => ({ ...n, read: true })));
        } catch (markErr) {
          if (!signal.aborted) {
            console.error("markAllNotificationsRead failed", markErr);
          }
        }
      }
    } catch (err) {
      if (signal.aborted) return;
      const message =
        err instanceof ApiRequestError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load notifications";
      setError(message);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [clearUnreadCount]);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchInitial(controller.signal);
    return () => controller.abort();
  }, [fetchInitial]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(null);

    try {
      const res = await getNotifications(nextCursor);
      setItems((prev) => [...prev, ...(res.notifications ?? [])]);
      setNextCursor(res.nextCursor);
    } catch (err) {
      const message =
        err instanceof ApiRequestError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load more notifications";
      setLoadMoreError(message);
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore]);

  useEffect(() => {
    const onFocus = () => void refreshUnreadCount();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshUnreadCount]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[640px]">
        <h1 className="mb-6 text-2xl font-bold tracking-tight text-white">
          Notifications
        </h1>
        <NotificationListSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[640px]">
        <h1 className="mb-6 text-2xl font-bold tracking-tight text-white">
          Notifications
        </h1>
        <div className="rounded-xl border border-red-900/50 bg-red-950/40 px-5 py-4 text-sm text-red-300">
          {error}{" "}
          <button
            type="button"
            onClick={() => {
              const controller = new AbortController();
              void fetchInitial(controller.signal);
            }}
            className="font-medium underline underline-offset-2 hover:text-red-200"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[640px]">
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-white">
        Notifications
      </h1>

      {loadMoreError ? (
        <div className="mb-4 rounded-xl border border-red-900/50 bg-red-950/40 px-5 py-4 text-sm text-red-300">
          {loadMoreError}{" "}
          <button
            type="button"
            onClick={() => void loadMore()}
            className="font-medium underline underline-offset-2 hover:text-red-200"
          >
            Retry
          </button>
        </div>
      ) : null}

      {items.length === 0 ? (
        <p className="py-16 text-center text-sm text-[#909090]">
          No notifications yet
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-0.5">
            {items.map((notification) => (
              <NotificationRow
                key={notification.notificationId}
                notification={notification}
              />
            ))}
          </div>

          {nextCursor ? (
            <div className="mt-6 flex justify-center">
              <Button
                type="button"
                variant="outline"
                disabled={loadingMore}
                onClick={() => void loadMore()}
                className="border-[#303030] bg-transparent text-[#e8e8e8] hover:bg-[#212121]"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
