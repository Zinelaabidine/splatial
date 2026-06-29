"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

type SlideOverPanelProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  headerAction?: ReactNode;
};

export default function SlideOverPanel({
  open,
  onClose,
  title,
  children,
  headerAction,
}: SlideOverPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="Close panel"
        tabIndex={open ? 0 : -1}
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="slide-over-title"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-[360px] flex-col border-l border-[#303030] bg-[#0f0f0f] transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#303030] px-4">
          <h2 id="slide-over-title" className="text-sm font-semibold text-white">
            {title}
          </h2>
          <div className="flex items-center gap-1">
            {headerAction}
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="rounded-lg p-1.5 text-[#909090] transition-colors hover:bg-[#1a1a1a] hover:text-white"
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </>
  );
}
