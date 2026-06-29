"use client";

import Link from "next/link";

import { UserAvatar } from "@/components/splatworks/SplatworksLogo";

function initialsFromDisplayName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
  }
  return (name.slice(0, 2) || "?").toUpperCase();
}

type FeedAuthorRowProps = {
  ownerUsername: string;
  ownerDisplayName: string;
  ownerAvatarUrl?: string | null;
};

export default function FeedAuthorRow({
  ownerUsername,
  ownerDisplayName,
  ownerAvatarUrl,
}: FeedAuthorRowProps) {
  const handle = ownerUsername.trim().toLowerCase();
  const initials = initialsFromDisplayName(ownerDisplayName || ownerUsername);

  if (!handle) {
    return (
      <div className="mb-3 flex items-center gap-2.5">
        <UserAvatar initials={initials} size={32} />
        <span className="truncate text-sm font-medium text-white">
          {ownerDisplayName || "Unknown creator"}
        </span>
      </div>
    );
  }

  return (
    <Link
      href={`/u/${encodeURIComponent(handle)}`}
      onClick={(e) => e.stopPropagation()}
      className="mb-3 flex items-center gap-2.5 rounded-lg transition-colors hover:bg-[#2a2a2a]/60"
    >
      {ownerAvatarUrl ? (
        <>
          {/* Presigned S3 URLs — not compatible with next/image */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ownerAvatarUrl}
            alt=""
            className="h-8 w-8 shrink-0 rounded-full object-cover"
          />
        </>
      ) : (
        <UserAvatar initials={initials} size={32} />
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-white">
          {ownerDisplayName || handle}
        </p>
        <p className="font-sw-mono truncate text-xs text-[#909090]">@{handle}</p>
      </div>
    </Link>
  );
}
