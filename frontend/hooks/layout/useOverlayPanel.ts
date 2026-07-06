"use client";

import { useEffect, useRef, type RefObject } from "react";

type UseOverlayPanelOptions = {
  open: boolean;
  onClose: () => void;
  panelRef: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
};

/**
 * Escape-to-close and outside-click dismiss for full-height overlay panels.
 * Focus moves into the panel when opened and returns to the trigger on close.
 */
export function useOverlayPanel({
  open,
  onClose,
  panelRef,
  returnFocusRef,
}: UseOverlayPanelOptions) {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const focusTarget = panelRef.current?.querySelector<HTMLElement>(
      "[data-overlay-focus]",
    );
    focusTarget?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const returnTo =
        returnFocusRef?.current ?? previousFocusRef.current ?? null;
      returnTo?.focus();
    };
  }, [open, onClose, panelRef, returnFocusRef]);
}
