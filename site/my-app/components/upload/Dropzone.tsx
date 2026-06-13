"use client";

import { useCallback, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";

import { cn } from "@/lib/utils";

const DEFAULT_ACCEPT = ".glb,.gltf,.ply,.obj,.splat";

interface DropzoneProps {
  /** Called when files are selected via click OR drop. */
  onFiles: (files: File[]) => void;
  /** Comma-separated list of accepted extensions / MIME types. */
  accept?: string;
  /** Allow multi-select. Defaults to true. */
  multiple?: boolean;
  /** Disable interaction (e.g. while a critical upload is in flight). */
  disabled?: boolean;
  className?: string;
}

/**
 * The hero dropzone on the Home canvas.
 *
 * - Click → opens native file picker
 * - Drag & drop → accepts one or many files
 * - Keyboard (Enter / Space) → opens the picker (a11y)
 */
export default function Dropzone({
  onFiles,
  accept = DEFAULT_ACCEPT,
  multiple = true,
  disabled = false,
  className,
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  // Drag events bubble through children; counter avoids flicker on enter/leave.
  const dragCounter = useRef(0);

  const openPicker = useCallback(() => {
    if (disabled) return;
    inputRef.current?.click();
  }, [disabled]);

  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list || list.length === 0) return;
      const files = Array.from(list);
      onFiles(files);
    },
    [onFiles],
  );

  const handleDragEnter = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current += 1;
      if (e.dataTransfer?.types?.includes("Files")) {
        setIsDragging(true);
      }
    },
    [disabled],
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = Math.max(0, dragCounter.current - 1);
      if (dragCounter.current === 0) setIsDragging(false);
    },
    [disabled],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
    },
    [disabled],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [disabled, handleFiles],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openPicker();
      }
    },
    [openPicker],
  );

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label="Upload 3D scene files"
      onClick={openPicker}
      onKeyDown={handleKeyDown}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={cn(
        "w-full max-w-2xl p-16 bg-white border-2 border-dashed border-slate-200 rounded-3xl shadow-sm",
        "hover:border-indigo-400 hover:bg-indigo-50/50 transition-all",
        "flex flex-col items-center justify-center cursor-pointer group",
        "focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200 focus-visible:border-indigo-400",
        isDragging && "border-indigo-500 bg-indigo-50 scale-[1.01] shadow-md",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      <div
        className={cn(
          "mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-slate-50 text-slate-400 transition-all",
          "group-hover:bg-indigo-100 group-hover:text-indigo-600",
          isDragging && "bg-indigo-100 text-indigo-600 scale-110",
        )}
      >
        <UploadCloud className="h-6 w-6" strokeWidth={1.75} />
      </div>

      <h2 className="text-lg font-semibold tracking-tight text-slate-900">
        {isDragging ? "Drop to upload" : "Drag your scene here"}
      </h2>
      <p className="mt-1.5 text-sm text-slate-500">
        or{" "}
        <span className="font-medium text-indigo-600 group-hover:underline">
          browse files
        </span>{" "}
        from your computer
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">
        <span className="rounded-full bg-slate-50 px-2.5 py-1">.glb</span>
        <span className="rounded-full bg-slate-50 px-2.5 py-1">.gltf</span>
        <span className="rounded-full bg-slate-50 px-2.5 py-1">.ply</span>
        <span className="rounded-full bg-slate-50 px-2.5 py-1">.obj</span>
        <span className="rounded-full bg-slate-50 px-2.5 py-1">.splat</span>
      </div>

      <p className="mt-4 text-xs text-slate-400">
        Files upload directly to S3 in 5&nbsp;MiB chunks
      </p>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="hidden"
        onChange={(e) => {
          handleFiles(e.currentTarget.files);
          e.currentTarget.value = "";
        }}
      />
    </div>
  );
}
