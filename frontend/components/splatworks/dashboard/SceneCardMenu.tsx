"use client";

import { useEffect, useRef, useState } from "react";
import { Globe, Lock, MoreVertical, Pencil, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { SceneVisibility } from "@/types/api";

type SceneCardMenuProps = {
  onEdit?: () => void;
  onDelete?: () => void;
  visibility: SceneVisibility;
  onVisibilityChange?: (next: SceneVisibility) => void;
  visibilityUpdating?: boolean;
  showEdit?: boolean;
  className?: string;
  buttonClassName?: string;
};

export default function SceneCardMenu({
  onEdit,
  onDelete,
  visibility,
  onVisibilityChange,
  visibilityUpdating = false,
  showEdit = false,
  className,
  buttonClassName,
}: SceneCardMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isPublic = visibility === "PUBLIC";

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div
      ref={ref}
      className={cn("relative", className)}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label="Scene actions"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cn(
          "rounded-md p-1 text-[var(--nord-slate)] transition-colors hover:bg-[var(--nord-tint)] hover:text-[var(--nord-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nord-hairline)]",
          open && "bg-[var(--nord-tint)] text-[var(--nord-ink)]",
          buttonClassName,
        )}
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          role="menu"
          className="sw-popover absolute right-0 top-full z-50 mt-1.5 min-w-[168px] overflow-hidden rounded-xl py-1"
          onClick={(e) => e.stopPropagation()}
        >
          {showEdit && onEdit && (
            <MenuItem
              icon={Pencil}
              label="Edit scene"
              onClick={() => {
                setOpen(false);
                onEdit();
              }}
            />
          )}
          {onVisibilityChange && (
            <MenuItem
              icon={isPublic ? Lock : Globe}
              label={
                visibilityUpdating
                  ? "Updating…"
                  : isPublic
                    ? "Make private"
                    : "Make public"
              }
              disabled={visibilityUpdating}
              onClick={() => {
                setOpen(false);
                onVisibilityChange(isPublic ? "PRIVATE" : "PUBLIC");
              }}
            />
          )}
          {onDelete && (
            <>
              <div className="my-1 border-t border-[var(--nord-hairline)]" />
              <MenuItem
                icon={Trash2}
                label="Delete"
                destructive
                onClick={() => {
                  setOpen(false);
                  onDelete();
                }}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  destructive = false,
  disabled = false,
}: {
  icon: typeof Pencil;
  label: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] font-medium transition-colors disabled:opacity-50",
        destructive
          ? "text-[var(--nord-danger)] hover:bg-[var(--nord-tint)]"
          : "text-[var(--nord-ink)] hover:bg-[var(--nord-tint)]",
      )}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
      {label}
    </button>
  );
}
