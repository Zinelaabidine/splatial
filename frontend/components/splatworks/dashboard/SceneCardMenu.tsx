"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Globe, Lock, MoreVertical, Pencil, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { SceneVisibility } from "@/types/api";

/** Gap (px) between the trigger button and the menu panel. */
const MENU_OFFSET = 6;
/** Minimum breathing room (px) kept between the menu and the viewport edge. */
const VIEWPORT_MARGIN = 8;

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
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{
    top?: number;
    bottom?: number;
    right: number;
  } | null>(null);
  const isPublic = visibility === "PUBLIC";

  // The dropdown is portaled to <body> (see render below) so it can render
  // fully on top of the scene card and viewport instead of being clipped by
  // the card's `overflow-hidden` (needed elsewhere for its rounded corners).
  // Position is therefore computed in viewport (fixed) coordinates rather
  // than relying on `position: relative` + `absolute` anchoring.
  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? 0;
    const spaceBelow = window.innerHeight - rect.bottom;
    const flipUp = menuHeight > 0 && spaceBelow < menuHeight + MENU_OFFSET + VIEWPORT_MARGIN;

    setCoords({
      ...(flipUp
        ? { bottom: window.innerHeight - rect.top + MENU_OFFSET }
        : { top: rect.bottom + MENU_OFFSET }),
      right: Math.max(VIEWPORT_MARGIN, window.innerWidth - rect.right),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    // First pass: anchor below the trigger before the menu has rendered
    // (its height isn't known yet, so no flip decision can be made).
    updatePosition();
  }, [open, updatePosition]);

  useLayoutEffect(() => {
    // Second pass: once the menu has actually mounted, re-measure its real
    // height so it can flip above the trigger when it would otherwise
    // overflow the bottom of the viewport.
    if (open && coords && menuRef.current) {
      updatePosition();
    }
    // Only re-run when the menu transitions between mounted/unmounted —
    // not on every coordinate change, or this would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, coords !== null]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const handleReposition = () => updatePosition();

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    // `capture: true` picks up scrolling on any ancestor scroll container
    // (e.g. the dashboard's scrollable content area), not just window.
    window.addEventListener("scroll", handleReposition, true);
    window.addEventListener("resize", handleReposition);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleReposition, true);
      window.removeEventListener("resize", handleReposition);
    };
  }, [open, updatePosition]);

  return (
    <div
      ref={triggerRef}
      className={className}
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

      {open &&
        coords &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: coords.top, bottom: coords.bottom, right: coords.right }}
            className="sw-popover fixed z-[var(--z-app-popover)] min-w-[168px] overflow-hidden rounded-xl py-1"
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
          </div>,
          document.body,
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
