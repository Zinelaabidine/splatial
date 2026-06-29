"use client";

import Link from "next/link";

import { UserAvatar } from "@/components/splatworks/SplatworksLogo";
import {
  initialsFromDisplayName,
  notificationHref,
  notificationMessageParts,
} from "@/lib/notifications/notificationPresentation";
import { formatRelativeTime } from "@/lib/time/formatRelativeTime";
import { cn } from "@/lib/utils";
import type { AppNotification } from "@/types/api";

type NotificationRowProps = {
  notification: AppNotification;
};

export default function NotificationRow({ notification }: NotificationRowProps) {
  const href = notificationHref(notification);
  const { actorLabel, suffix } = notificationMessageParts(notification);
  const initials = initialsFromDisplayName(
    notification.actorDisplayName || notification.actorUsername,
  );

  return (
    <Link
      href={href}
      className={cn(
        "flex gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-[#1a1a1a]",
        !notification.read && "bg-[#1a2433]/80 ring-1 ring-[#3b82f6]/25",
      )}
    >
      {notification.actorAvatarUrl ? (
        <>
          {/* Presigned S3 URLs — not compatible with next/image */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={notification.actorAvatarUrl}
            alt=""
            className="h-10 w-10 shrink-0 rounded-full object-cover"
          />
        </>
      ) : (
        <UserAvatar initials={initials} size={40} />
      )}

      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug text-[#e8e8e8]">
          <span className="font-semibold text-white">{actorLabel}</span>
          {suffix}
        </p>
        <time
          dateTime={notification.createdAt}
          className="mt-1 block font-sw-mono text-[11px] text-[#737373]"
          title={notification.createdAt}
        >
          {formatRelativeTime(notification.createdAt)}
        </time>
      </div>

      {!notification.read ? (
        <span
          className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#3b82f6]"
          aria-hidden
        />
      ) : null}
    </Link>
  );
}
