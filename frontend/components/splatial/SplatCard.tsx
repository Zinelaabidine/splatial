"use client";

import { useEffect, useRef, useState } from "react";
import {
  Box,
  Download,
  FileArchive,
  MoreVertical,
  Pencil,
  Play,
  Share2,
  Trash2,
} from "lucide-react";

import SplatPreviewVisual from "@/components/splatial/SplatPreviewVisual";
import { UserAvatar } from "@/components/splatial/SplatialLogo";
import { formatSplatStats } from "@/lib/splatial/formatters";
import { cn } from "@/lib/utils";
import type { Splat } from "@/types/splatial";

type SplatCardProps = {
  splat: Splat;
  onOpen3D: (splat: Splat) => void;
  onTour: (splat: Splat) => void;
  onCardClick: (splat: Splat) => void;
  /** Downloads the generated output (.ply/.splat) — owner-only, paid tiers. */
  onDownload: (splat: Splat) => void;
  /** Downloads the original raw source upload — owner-only, paid tiers. */
  onDownloadRaw: (splat: Splat) => void;
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
  onDownloadRaw,
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
        "group relative flex flex-col rounded-xl bg-[var(--nord-surface)] transition-transform duration-200 hover:-translate-y-1",
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
        <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--nord-success)] bg-[var(--nord-success)] px-2.5 py-1 font-sw-mono text-[10px] font-semibold uppercase tracking-wide text-[var(--nord-success)] backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--nord-success)]" aria-hidden />
          Completed
        </span>
      </div>

      {/* Action bar */}
      <div
        className="flex items-center justify-between border-y border-[var(--nord-hairline)] bg-[var(--nord-bg)] px-3 py-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => onOpen3D(splat)}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-[var(--nord-ink)] transition-colors hover:bg-[var(--nord-pine-tint)] hover:text-[var(--nord-pine)]"
        >
          <Box className="h-3.5 w-3.5 text-[#3b82f6]" strokeWidth={1.5} />
          3D Viewer: Open
        </button>
        <button
          type="button"
          onClick={() => onTour(splat)}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 font-sw-mono text-[10px] font-semibold tracking-wide text-[var(--nord-slate)] transition-colors hover:bg-[var(--nord-pine-tint)] hover:text-[var(--nord-pine)]"
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
            <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-snug text-[var(--nord-ink)]">
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
                  "rounded-full p-1.5 text-[var(--nord-ink)] transition-colors hover:bg-[var(--nord-surface)] hover:text-[var(--nord-ink)]",
                  menuOpen ? "bg-[var(--nord-surface)] text-[var(--nord-ink)] opacity-100" : "opacity-70 group-hover:opacity-100",
                )}
              >
                <MoreVertical className="h-4 w-4" />
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute bottom-full right-0 z-50 mb-2 min-w-[188px] overflow-hidden rounded-lg border border-[var(--nord-hairline)] bg-[var(--nord-surface)] py-1.5 shadow-2xl ring-1 ring-[var(--nord-hairline)]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MenuItem
                    icon={Download}
                    label="Download"
                    onClick={() => {
                      setMenuOpen(false);
                      onDownload(splat);
                    }}
                  />
                  <MenuItem
                    icon={FileArchive}
                    label="Download original"
                    onClick={() => {
                      setMenuOpen(false);
                      onDownloadRaw(splat);
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
                  <div className="my-1 border-t border-[var(--nord-hairline)]" />
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

          <p className="mt-0.5 truncate text-sm text-[var(--nord-slate)]">
            {splat.author.name}
          </p>
          <p className="mt-1 font-sw-mono text-xs text-[var(--nord-slate)]">{stats}</p>
          <p className="mt-0.5 text-xs text-[var(--nord-slate-soft)]">
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
        "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-medium transition-colors hover:bg-[var(--nord-surface)]",
        destructive ? "text-[var(--nord-danger)] hover:bg-[var(--nord-danger-tint)]" : "text-[var(--nord-ink)]",
      )}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
      {label}
    </button>
  );
}
