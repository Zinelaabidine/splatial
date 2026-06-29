"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";

import { useNotificationsBadge } from "@/hooks/notifications/useNotificationsBadge";
import { cn } from "@/lib/utils";

export default function NotificationBell() {
  const pathname = usePathname();
  const { unreadCount } = useNotificationsBadge();
  const isActive = pathname === "/notifications";

  return (
    <Link
      href="/notifications"
      aria-label={
        unreadCount > 0
          ? `Notifications, ${unreadCount} unread`
          : "Notifications"
      }
      className={cn(
        "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors",
        isActive
          ? "bg-[#263850]/80 text-[#93c5fd]"
          : "text-[#f1f1f1] hover:bg-[#212121]",
      )}
    >
      <Bell className="h-5 w-5" strokeWidth={isActive ? 2 : 1.5} />
      {unreadCount > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#3b82f6] px-1 text-[10px] font-bold leading-none text-white">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      ) : null}
    </Link>
  );
}
