"use client";

import { useMemo } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  Play,
  Trash2,
  X,
  XCircle,
} from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { UploadItem, UploadStage } from "@/types/api";

interface RightSidebarProps {
  uploads: UploadItem[];
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
  onClearTerminated: () => void;
  onSubmit: (id: string) => void;
}

const ACTIVE_STAGES: ReadonlySet<UploadStage> = new Set([
  "queued",
  "initializing",
  "presigning",
  "uploading",
  "completing",
  "processing",
]);

const STAGE_LABEL: Record<UploadStage, string> = {
  queued: "Queued",
  initializing: "Initializing",
  presigning: "Signing parts",
  uploading: "Uploading",
  completing: "Finalizing",
  uploaded: "Uploaded",
  processing: "Generating",
  ready: "Ready",
  failed: "Failed",
  canceled: "Canceled",
};

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const v = bytes / Math.pow(1024, i);
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatTimeAgo(ts?: number): string {
  if (!ts) return "";
  const diff = Math.max(0, Date.now() - ts);
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/**
 * Right-rail panel: live queue of in-flight uploads on top, terminated
 * outputs (success/failure/canceled) below.
 */
export default function RightSidebar({
  uploads,
  onCancel,
  onRemove,
  onClearTerminated,
  onSubmit,
}: RightSidebarProps) {
  const { active, terminated } = useMemo(() => {
    const a: UploadItem[] = [];
    const t: UploadItem[] = [];
    for (const u of uploads) {
      if (ACTIVE_STAGES.has(u.stage)) a.push(u);
      else t.push(u);
    }
    return { active: a, terminated: t };
  }, [uploads]);

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-slate-900">
            Activity
          </h3>
          <p className="text-xs text-slate-400">
            {active.length === 0 && terminated.length === 0
              ? "Nothing here yet"
              : `${active.length} active · ${terminated.length} recent`}
          </p>
        </div>
        {terminated.length > 0 ? (
          <Button
            variant="ghost"
            size="xs"
            onClick={onClearTerminated}
            className="text-slate-400 hover:text-slate-700"
          >
            <Trash2 className="h-3 w-3" />
            Clear
          </Button>
        ) : null}
      </header>

      {/* Active queue */}
      <section className="flex flex-col gap-3">
        <SectionLabel>In progress</SectionLabel>
        {active.length === 0 ? (
          <EmptyState
            icon={<Loader2 className="h-4 w-4" />}
            title="No active uploads"
            subtitle="Drop a scene to get started."
          />
        ) : (
          <ul className="flex flex-col gap-2.5">
            {active.map((u) => (
              <ActiveRow key={u.id} item={u} onCancel={onCancel} />
            ))}
          </ul>
        )}
      </section>

      {/* Recent outputs */}
      <section className="flex flex-col gap-3">
        <SectionLabel>Recent outputs</SectionLabel>
        {terminated.length === 0 ? (
          <EmptyState
            icon={<ImageIcon className="h-4 w-4" />}
            title="No outputs yet"
            subtitle="Completed scenes will appear here."
          />
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {terminated.map((u) => (
              <RecentTile key={u.id} item={u} onRemove={onRemove} onSubmit={onSubmit} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
      {children}
    </h4>
  );
}

function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-100 bg-slate-50/40 px-3 py-6 text-center">
      <span className="text-slate-300">{icon}</span>
      <p className="text-xs font-medium text-slate-600">{title}</p>
      <p className="text-[11px] text-slate-400">{subtitle}</p>
    </div>
  );
}

function ActiveRow({
  item,
  onCancel,
}: {
  item: UploadItem;
  onCancel: (id: string) => void;
}) {
  const indeterminate =
    item.stage === "queued" ||
    item.stage === "initializing" ||
    item.stage === "presigning" ||
    item.stage === "completing" ||
    item.stage === "processing";

  return (
    <li className="group rounded-xl border border-slate-100 bg-white p-3 transition-colors hover:border-slate-200">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-slate-900">
            {item.filename}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
            <span>{formatBytes(item.size)}</span>
            <span className="h-1 w-1 rounded-full bg-slate-200" />
            <span className="inline-flex items-center gap-1 text-slate-500">
              {item.stage === "processing" ? (
                <Loader2 className="h-3 w-3 animate-spin text-indigo-500" />
              ) : item.stage === "uploading" ? null : (
                <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
              )}
              {STAGE_LABEL[item.stage]}
              {item.stage === "uploading" ? ` · ${item.progress}%` : ""}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => onCancel(item.id)}
          className="rounded-md p-1 text-slate-300 opacity-0 transition-all hover:bg-slate-50 hover:text-slate-700 group-hover:opacity-100"
          aria-label="Cancel upload"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <Progress
        value={item.progress}
        className={cn(
          "mt-3 [&_[data-slot=progress-track]]:bg-slate-100 [&_[data-slot=progress-track]]:h-1",
          "[&_[data-slot=progress-indicator]]:bg-indigo-500",
          indeterminate && "[&_[data-slot=progress-indicator]]:animate-pulse [&_[data-slot=progress-indicator]]:opacity-60",
        )}
      />
    </li>
  );
}

function RecentTile({
  item,
  onRemove,
  onSubmit,
}: {
  item: UploadItem;
  onRemove: (id: string) => void;
  onSubmit: (id: string) => void;
}) {
  const ok = item.stage === "ready";
  const canceled = item.stage === "canceled";
  const uploaded = item.stage === "uploaded";

  return (
    <li className="group relative overflow-hidden rounded-xl border border-slate-100 bg-white transition-colors hover:border-slate-200">
      <div className="relative aspect-square w-full bg-slate-50">
        {item.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.thumbnailUrl}
            alt={item.filename}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-slate-300">
            {ok ? (
              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
            ) : canceled ? (
              <XCircle className="h-6 w-6 text-slate-400" />
            ) : uploaded ? (
              <Play className="h-6 w-6 text-indigo-400" />
            ) : (
              <AlertCircle className="h-6 w-6 text-rose-500" />
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="absolute right-1.5 top-1.5 rounded-md bg-white/80 p-1 text-slate-400 opacity-0 backdrop-blur-sm transition-opacity hover:bg-white hover:text-slate-700 group-hover:opacity-100"
          aria-label="Dismiss"
        >
          <X className="h-3 w-3" />
        </button>

        <span
          className={cn(
            "absolute bottom-1.5 left-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
            ok && "bg-emerald-50 text-emerald-700",
            uploaded && "bg-indigo-50 text-indigo-700",
            !ok && !canceled && !uploaded && "bg-rose-50 text-rose-700",
            canceled && "bg-slate-100 text-slate-500",
          )}
        >
          {STAGE_LABEL[item.stage]}
        </span>
      </div>

      <div className="p-2">
        <p className="truncate text-[11px] font-medium text-slate-900">
          {item.filename}
        </p>
        <p className="text-[10px] text-slate-400">
          {formatTimeAgo(item.finishedAt ?? item.startedAt)}
        </p>
        {item.error ? (
          <p
            className="mt-0.5 truncate text-[10px] text-rose-500"
            title={item.error}
          >
            {item.error}
          </p>
        ) : null}
        {uploaded ? (
          <button
            type="button"
            onClick={() => onSubmit(item.id)}
            className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-md bg-indigo-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-indigo-700 active:bg-indigo-800"
          >
            <Play className="h-2.5 w-2.5" />
            Submit
          </button>
        ) : null}
      </div>
    </li>
  );
}
