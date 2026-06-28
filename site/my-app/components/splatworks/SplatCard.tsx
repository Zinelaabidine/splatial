"use client";

import { useEffect, useRef, useState } from "react";
import {
  Box,
  Download,
  MoreVertical,
  Pencil,
  Play,
  Share2,
  Trash2,
} from "lucide-react";

import SplatPreviewVisual from "@/components/splatworks/SplatPreviewVisual";
import { UserAvatar } from "@/components/splatworks/SplatworksLogo";
import { formatSplatStats } from "@/lib/splatworks/formatters";
import { cn } from "@/lib/utils";
import type { Splat } from "@/types/splatworks";

type SplatCardProps = {
  splat: Splat;
  onOpen3D: (splat: Splat) => void;
  onTour: (splat: Splat) => void;
  onCardClick: (splat: Splat) => void;
  onDownload: (splat: Splat, format: "ply" | "splat") => void;
  onShare: (splat: Splat) => void;
  onRename: (splat: Splat) => void;
  onDelete: (splat: Splat) => void;
};

export default function SplatCard({
  splat,
  onOpen3D,
  onTour,
  onCardClick,
  onDownload,
  onShare,
  onRename,
  onDelete,
}: SplatCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const stats = formatSplatStats(splat.splatCount, splat.fileSizeMb);

  return (
    <article
      className={cn(
        "group relative flex flex-col rounded-xl bg-[#212121] transition-transform duration-200 hover:-translate-y-1",
        menuOpen && "z-50",
      )}
      onClick={() => onCardClick(splat)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onCardClick(splat);
        }
      }}
      role="button"
      tabIndex={0}
    >
      {/* Thumbnail — ~70% visual weight */}
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-t-xl">
        {splat.thumbnailUrl ? (
          <>
            {/* Presigned S3 URLs — not compatible with next/image */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={splat.thumbnailUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          </>
        ) : (
          <SplatPreviewVisual
            subject={splat.subject}
            className="relative h-full w-full"
          />
        )}
        <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-[#166534]/60 bg-[#14532d]/90 px-2.5 py-1 font-sw-mono text-[10px] font-semibold uppercase tracking-wide text-[#86efac] backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-[#4ade80]" aria-hidden />
          Completed
        </span>
      </div>

      {/* Action bar */}
      <div
        className="flex items-center justify-between border-y border-[#303030] bg-[#181818] px-3 py-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => onOpen3D(splat)}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-[#d4d4d4] transition-colors hover:bg-[#262626] hover:text-white"
        >
          <Box className="h-3.5 w-3.5 text-[#3b82f6]" strokeWidth={1.5} />
          3D Viewer: Open
        </button>
        <button
          type="button"
          onClick={() => onTour(splat)}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 font-sw-mono text-[10px] font-semibold tracking-wide text-[#a3a3a3] transition-colors hover:bg-[#262626] hover:text-white"
        >
          <Play className="h-3 w-3 fill-current" />
          PLAY
        </button>
      </div>

      {/* Metadata — ~30% */}
      <div className="flex gap-3 rounded-b-xl p-3">
        <UserAvatar initials={splat.author.initials} size={36} className="mt-0.5" />

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-snug text-white">
              {splat.title}
            </h3>
            <div
              ref={menuRef}
              className="relative shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                aria-label="More actions"
                aria-expanded={menuOpen}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen((o) => !o);
                }}
                className={cn(
                  "rounded-full p-1.5 text-[#b3b3b3] transition-colors hover:bg-[#303030] hover:text-white",
                  menuOpen ? "bg-[#303030] text-white opacity-100" : "opacity-70 group-hover:opacity-100",
                )}
              >
                <MoreVertical className="h-4 w-4" />
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute bottom-full right-0 z-50 mb-2 min-w-[188px] overflow-hidden rounded-lg border border-[#404040] bg-[#1a1a1a] py-1.5 shadow-2xl ring-1 ring-black/50"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MenuItem
                    icon={Download}
                    label="Download .ply"
                    onClick={() => {
                      setMenuOpen(false);
                      onDownload(splat, "ply");
                    }}
                  />
                  <MenuItem
                    icon={Download}
                    label="Download .splat"
                    onClick={() => {
                      setMenuOpen(false);
                      onDownload(splat, "splat");
                    }}
                  />
                  <MenuItem
                    icon={Share2}
                    label="Share"
                    onClick={() => {
                      setMenuOpen(false);
                      onShare(splat);
                    }}
                  />
                  <MenuItem
                    icon={Pencil}
                    label="Rename"
                    onClick={() => {
                      setMenuOpen(false);
                      onRename(splat);
                    }}
                  />
                  <div className="my-1 border-t border-[#303030]" />
                  <MenuItem
                    icon={Trash2}
                    label="Delete"
                    destructive
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete(splat);
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          <p className="mt-0.5 truncate text-sm text-[#aaaaaa]">
            {splat.author.name}
          </p>
          <p className="mt-1 font-sw-mono text-xs text-[#909090]">{stats}</p>
          <p className="mt-0.5 text-xs text-[#717171]">
            Created {splat.createdAt}
          </p>
        </div>
      </div>
    </article>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  destructive = false,
}: {
  icon: typeof Download;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-medium transition-colors hover:bg-[#2a2a2a]",
        destructive ? "text-[#f87171] hover:bg-red-950/40" : "text-[#f0f0f0]",
      )}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
      {label}
    </button>
  );
}
