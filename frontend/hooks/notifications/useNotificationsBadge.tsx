"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { getUnreadCount } from "@/services/notificationsService";
import { isTransientNetworkError } from "@/lib/api/apiErrors";

const POLL_MS = 45_000;
const RETRY_MS = 1_500;

type NotificationsBadgeContextValue = {
  unreadCount: number;
  refreshUnreadCount: () => Promise<void>;
  clearUnreadCount: () => void;
};

const NotificationsBadgeContext =
  createContext<NotificationsBadgeContextValue | null>(null);

export function NotificationsBadgeProvider({ children }: { children: ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const refreshUnreadCount = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await getUnreadCount(ctrl.signal);
      if (!ctrl.signal.aborted) {
        setUnreadCount(Math.max(0, res.unreadCount ?? 0));
      }
    } catch (err) {
      if (ctrl.signal.aborted) return;
      if (isTransientNetworkError(err)) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
        if (ctrl.signal.aborted) return;
        try {
          const res = await getUnreadCount(ctrl.signal);
          if (!ctrl.signal.aborted) {
            setUnreadCount(Math.max(0, res.unreadCount ?? 0));
          }
        } catch {
          /* keep last known count on transient failures */
        }
      }
    }
  }, []);

  const clearUnreadCount = useCallback(() => {
    setUnreadCount(0);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshUnreadCount();

    const timer = setInterval(() => void refreshUnreadCount(), POLL_MS);

    const onFocus = () => void refreshUnreadCount();
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      abortRef.current?.abort();
    };
  }, [refreshUnreadCount]);

  const value: NotificationsBadgeContextValue = {
    unreadCount,
    refreshUnreadCount,
    clearUnreadCount,
  };

  return (
    <NotificationsBadgeContext.Provider value={value}>
      {children}
    </NotificationsBadgeContext.Provider>
  );
}

export function useNotificationsBadge(): NotificationsBadgeContextValue {
  const ctx = useContext(NotificationsBadgeContext);
  if (!ctx) {
    throw new Error(
      "useNotificationsBadge must be used within NotificationsBadgeProvider",
    );
  }
  return ctx;
}
