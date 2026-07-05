"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Loader2 } from "lucide-react";

import NotificationRow from "@/components/notifications/NotificationRow";
import { useDismissablePopover } from "@/hooks/layout/useDismissablePopover";
import { useNotificationsBadge } from "@/hooks/notifications/useNotificationsBadge";
import { ApiRequestError } from "@/lib/api/apiErrors";
import { cn } from "@/lib/utils";
import {
  getNotifications,
  markAllNotificationsRead,
} from "@/services/notificationsService";
import type { AppNotification } from "@/types/api";

const PREVIEW_LIMIT = 8;

// Facebook-style anchored popover — a short preview list instead of
// navigating straight to the full /notifications page. Opening it marks
// everything read, same as the full page always did.
export default function NotificationBell() {
  const { unreadCount, clearUnreadCount } = useNotificationsBadge();
  const { open, setOpen, ref } = useDismissablePopover<HTMLDivElement>();

  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const markedReadRef = useRef(false);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError(null);

    try {
      const res = await getNotifications(undefined, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setItems(res.notifications ?? []);

      if (!markedReadRef.current) {
        markedReadRef.current = true;
        try {
          await markAllNotificationsRead(ctrl.signal);
          if (ctrl.signal.aborted) return;
          clearUnreadCount();
          setItems((prev) => prev.map((n) => ({ ...n, read: true })));
        } catch (markErr) {
          if (!ctrl.signal.aborted) {
            console.error("markAllNotificationsRead failed", markErr);
          }
        }
      }
    } catch (err) {
      if (ctrl.signal.aborted) return;
      const message =
        err instanceof ApiRequestError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load notifications";
      setError(message);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, [clearUnreadCount]);

  useEffect(() => {
    if (!open) return;
    markedReadRef.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => abortRef.current?.abort();
  }, [open, load]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors",
          open ? "bg-white/10 text-white" : "text-[#f1f1f1] hover:bg-white/10",
        )}
      >
        <Bell className="h-5 w-5" strokeWidth={open ? 2 : 1.5} />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#3b82f6] px-1 text-[10px] font-bold leading-none text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open && (
        <div
          aria-label="Notifications"
          className="sw-popover absolute right-0 top-full z-50 mt-2 w-96 overflow-hidden rounded-xl"
        >
          <div className="border-b border-white/[0.06] px-4 py-3">
            <h3 className="text-sm font-semibold text-white">Notifications</h3>
          </div>

          <div className="max-h-[420px] overflow-y-auto p-1">
            {error && (
              <div className="mx-3 mt-3 rounded-lg border border-[#5b2626] bg-[#2a1414] px-3 py-2 text-xs text-[#f0a8a8]">
                {error}
              </div>
            )}

            {loading && items.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-[#909090]">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading…
              </div>
            ) : items.length === 0 ? (
              <div className="flex h-32 items-center justify-center px-4 text-center text-sm text-[#808080]">
                No notifications yet
              </div>
            ) : (
              <div className="flex flex-col gap-0.5" onClick={() => setOpen(false)}>
                {items.slice(0, PREVIEW_LIMIT).map((notification) => (
                  <NotificationRow
                    key={notification.notificationId}
                    notification={notification}
                  />
                ))}
              </div>
            )}
          </div>

          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-white/[0.06] px-4 py-2.5 text-center text-xs font-medium text-[#93c5fd] transition-colors hover:bg-white/[0.06]"
          >
            See all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
