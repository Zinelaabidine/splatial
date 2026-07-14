"use client";

import { useRef, type ReactNode, type RefObject } from "react";

import { useOverlayPanel } from "@/hooks/layout/useOverlayPanel";
import { cn } from "@/lib/utils";

type OverlayPanelVariant = "docked" | "floating";

type OverlayPanelProps = {
  open: boolean;
  onClose: () => void;
  side: "left" | "right";
  ariaLabel: string;
  children: ReactNode;
  widthClass?: string;
  returnFocusRef?: RefObject<HTMLElement | null>;
  showBackdrop?: boolean;
  variant?: OverlayPanelVariant;
};

export default function OverlayPanel({
  open,
  onClose,
  side,
  ariaLabel,
  children,
  widthClass,
  returnFocusRef,
  showBackdrop = true,
  variant = "docked",
}: OverlayPanelProps) {
  const panelRef = useRef<HTMLElement>(null);

  useOverlayPanel({ open, onClose, panelRef, returnFocusRef });

  const isFloating = variant === "floating";

  const defaultWidth = isFloating
    ? "w-[min(400px,calc(100vw-1.5rem))]"
    : side === "left"
      ? "w-[min(300px,calc(100vw-2rem))]"
      : "w-[min(380px,calc(100vw-2rem))]";

  const closedTransform =
    side === "left" ? "-translate-x-full" : "translate-x-[calc(100%+0.75rem)]";

  return (
    <>
      {showBackdrop ? (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden={!open}
          aria-label="Close panel"
          className={cn(
            "fixed inset-x-0 bottom-0 top-[3.25rem] z-[var(--z-app-overlay-backdrop)] transition-opacity duration-300",
            isFloating ? "bg-[var(--nord-scrim)] backdrop-blur-[2px]" : "bg-[var(--nord-scrim)] backdrop-blur-[1px]",
            open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
          )}
          onClick={onClose}
        />
      ) : null}

      <aside
        ref={panelRef}
        role="dialog"
        aria-modal={open}
        aria-label={ariaLabel}
        aria-hidden={!open}
        className={cn(
          "sw-overlay-panel fixed z-[var(--z-app-overlay-panel)] flex flex-col overflow-hidden",
          "transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          isFloating
            ? cn(
                "sw-overlay-panel-floating",
                "top-[calc(3.25rem+0.75rem)] right-3 bottom-3 rounded-2xl",
                widthClass ?? defaultWidth,
              )
            : cn(
                "bottom-0 top-[3.25rem]",
                widthClass ?? defaultWidth,
                side === "left" ? "left-0" : "right-0",
              ),
          open
            ? "pointer-events-auto translate-x-0 opacity-100"
            : cn("pointer-events-none opacity-0", closedTransform),
        )}
      >
        {children}
      </aside>
    </>
  );
}
