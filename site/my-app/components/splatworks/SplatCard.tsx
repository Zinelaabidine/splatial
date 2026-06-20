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
      className="group flex flex-col overflow-hidden rounded-xl bg-[#212121] transition-transform duration-200 hover:-translate-y-1"
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
      <div className="relative aspect-[16/10] w-full overflow-hidden">
        <SplatPreviewVisual
          subject={splat.subject}
          className="relative h-full w-full"
        />
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
      <div className="flex gap-3 p-3">
        <UserAvatar initials={splat.author.initials} size={36} className="mt-0.5" />

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-snug text-white">
              {splat.title}
            </h3>
            <div ref={menuRef} className="relative shrink-0">
              <button
                type="button"
                aria-label="More actions"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((o) => !o)}
                className="rounded-full p-1 text-[#909090] opacity-0 transition-opacity hover:bg-[#303030] hover:text-white group-hover:opacity-100"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full z-20 mt-1 min-w-[168px] rounded-lg border border-[#303030] bg-[#212121] py-1 shadow-xl">
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
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-[#303030]",
        destructive ? "text-[#f87171]" : "text-[#e5e5e5]",
      )}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
      {label}
    </button>
  );
}
