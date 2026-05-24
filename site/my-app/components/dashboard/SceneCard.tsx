"use client";

import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  MoreHorizontal,
  Pencil,
  Share2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MockScene } from "@/types/dashboard";

type SceneCardProps = {
  scene: MockScene;
  onViewScene?: (scene: MockScene) => void;
};

function CompleteThumbnail({ hue = 260 }: { hue?: number }) {
  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-lg"
      style={{
        background: `linear-gradient(145deg, hsl(${hue} 40% 92%) 0%, hsl(${hue + 25} 38% 76%) 55%, hsl(${hue + 50} 30% 60%) 100%)`,
      }}
    >
      {/* Simulated 3D scene geometry */}
      <div className="absolute inset-0">
        {/* Floor plane */}
        <div
          className="absolute bottom-0 left-0 right-0 h-1/3 opacity-70"
          style={{ background: `linear-gradient(to top, hsl(${hue + 20} 25% 65%), transparent)` }}
        />
        {/* Main object — tall block */}
        <div
          className="absolute bottom-[28%] left-[22%] h-[38%] w-[18%] rounded-sm opacity-80"
          style={{ background: `linear-gradient(160deg, rgba(255,255,255,0.55), rgba(255,255,255,0.2))` }}
        />
        {/* Side face shadow */}
        <div
          className="absolute bottom-[28%] left-[40%] h-[38%] w-[6%] rounded-sm opacity-50"
          style={{ background: `rgba(0,0,0,0.18)` }}
        />
        {/* Secondary block */}
        <div
          className="absolute bottom-[28%] right-[20%] h-[24%] w-[14%] rounded-sm opacity-75"
          style={{ background: `rgba(255,255,255,0.4)` }}
        />
      </div>
      {/* Key light highlight */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_18%,rgba(255,255,255,0.55),transparent_48%)]" />
    </div>
  );
}

function DraftThumbnail() {
  return (
    <div className="flex h-full w-full items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50">
      <svg viewBox="0 0 80 64" className="h-12 w-16 text-gray-400" aria-hidden>
        <path
          d="M8 52 L24 20 L40 36 L56 12 L72 52 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
        <rect x="20" y="44" width="40" height="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <line x1="8" y1="52" x2="72" y2="52" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

function ProcessingThumbnail({ hue = 200 }: { hue?: number }) {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg">
      <div className="absolute inset-0 scale-105 blur-md">
        <CompleteThumbnail hue={hue} />
      </div>
      <div className="absolute inset-0 bg-white/20" />
    </div>
  );
}

function PreprocessingThumbnail() {
  return (
    <div className="flex h-full w-full items-center justify-center rounded-lg bg-gray-100">
      <FileText className="h-10 w-10 text-gray-400" strokeWidth={1.25} />
    </div>
  );
}

function StatusIndicator({ scene }: { scene: MockScene }) {
  switch (scene.state) {
    case "complete":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-600">
          <CheckCircle2 className="h-4 w-4" />
          Complete
        </span>
      );
    case "draft":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500">
          <Pencil className="h-3.5 w-3.5" />
          Draft
        </span>
      );
    case "processing":
      return (
        <div className="w-full max-w-[180px] space-y-1.5">
          <div className="h-1.5 overflow-hidden rounded-full bg-purple-100">
            <div
              className="h-full rounded-full bg-purple-600 transition-all"
              style={{ width: `${scene.processingProgress ?? 0}%` }}
            />
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-purple-600">
            <Loader2 className="h-3 w-3 animate-spin" />
            {scene.processingProgress ?? 0}% Processing
          </span>
        </div>
      );
    case "preprocessing":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-purple-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-purple-500" />
          </span>
          Preprocessing
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-500">
          <AlertCircle className="h-3.5 w-3.5" />
          Failed
        </span>
      );
  }
}

function PrimaryAction({
  scene,
  onViewScene,
}: {
  scene: MockScene;
  onViewScene?: (scene: MockScene) => void;
}) {
  switch (scene.state) {
    case "complete":
      return (
        <Button
          size="sm"
          className="bg-purple-600 text-white hover:bg-purple-700"
          onClick={() => onViewScene?.(scene)}
        >
          View Scene
        </Button>
      );
    case "draft":
      return (
        <Button size="sm" className="bg-purple-600 text-white hover:bg-purple-700">
          Continue Editing
        </Button>
      );
    case "processing":
      return (
        <Button size="sm" className="bg-purple-600 text-white hover:bg-purple-700">
          Cancel
        </Button>
      );
    case "preprocessing":
      return (
        <Button size="sm" className="bg-purple-600 text-white hover:bg-purple-700">
          Cancel Preprocessing
        </Button>
      );
    case "failed":
      return (
        <Button size="sm" className="border border-red-200 bg-red-50 text-red-600 hover:bg-red-100">
          Retry
        </Button>
      );
  }
}

export default function SceneCard({ scene, onViewScene }: SceneCardProps) {
  const shareDisabled = scene.state === "processing" || scene.state === "failed";

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="flex gap-4 p-4">
        <div className="h-24 w-28 shrink-0">
          {scene.state === "complete" && <CompleteThumbnail hue={scene.thumbnailHue} />}
          {scene.state === "draft" && <DraftThumbnail />}
          {scene.state === "processing" && (
            <ProcessingThumbnail hue={scene.thumbnailHue} />
          )}
          {scene.state === "preprocessing" && <PreprocessingThumbnail />}
          {scene.state === "failed" && <PreprocessingThumbnail />}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div>
            <h3 className="truncate text-sm font-semibold text-gray-900">{scene.title}</h3>
            <div className="mt-1">
              <StatusIndicator scene={scene} />
            </div>
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-1.5">
            <PrimaryAction scene={scene} onViewScene={onViewScene} />
            <Button
              variant="outline"
              size="sm"
              disabled={shareDisabled}
              className={cn(shareDisabled && "opacity-40")}
            >
              <Share2 className="h-3.5 w-3.5" />
              Share
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="More actions">
              <MoreHorizontal className="h-4 w-4 text-gray-500" />
            </Button>
          </div>
        </div>
      </div>

      <footer className="border-t border-gray-100 px-4 py-3">
        <div className="space-y-0.5 text-xs text-gray-500">
          <p>
            <span className="text-gray-400">Created:</span>{" "}
            <span className="font-medium text-gray-600">{scene.createdAt}</span>
          </p>
          <p>
            <span className="text-gray-400">Last Modified:</span>{" "}
            <span className="font-medium text-gray-600">{scene.lastModified}</span>
          </p>
        </div>
      </footer>
    </article>
  );
}
