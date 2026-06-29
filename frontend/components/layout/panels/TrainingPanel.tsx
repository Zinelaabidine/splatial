"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAuthSession } from "aws-amplify/auth";
import { Loader2, RefreshCw } from "lucide-react";

import SlideOverPanel from "@/components/layout/panels/SlideOverPanel";
import { listAdminAttempts } from "@/services/adminService";
import type { AdminAttempt } from "@/types/admin";

/** Matches DashboardSceneCard DARK_STATUS badge colours. */
const STATUS_BADGE: Record<
  string,
  { label: string; tile: string; text: string; pulse?: boolean }
> = {
  READY: { label: "Ready", tile: "#0a0a0a", text: "#4ade80" },
  FAILED: { label: "Failed", tile: "#2a1515", text: "#f87171" },
  PROCESSING: { label: "Training", tile: "#1a2332", text: "#60a5fa", pulse: true },
  QUEUED: { label: "Training", tile: "#1a2332", text: "#60a5fa", pulse: true },
  CANCELLED: { label: "Cancelled", tile: "#262626", text: "#a3a3a3" },
};

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncateName(name: string | null | undefined, max = 28): string {
  const s = (name ?? "Untitled").trim() || "Untitled";
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

type TrainingPanelProps = {
  open: boolean;
  onClose: () => void;
};

export default function TrainingPanel({ open, onClose }: TrainingPanelProps) {
  const [attempts, setAttempts] = useState<AdminAttempt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError(null);

    try {
      const session = await fetchAuthSession();
      const userId = session.tokens?.idToken?.payload?.sub;
      const userIdStr = typeof userId === "string" ? userId : undefined;

      const res = await listAdminAttempts({
        limit: 50,
        signal: ctrl.signal,
      });

      const mine = userIdStr
        ? res.items.filter((a) => a.userId === userIdStr)
        : res.items;

      if (!ctrl.signal.aborted) setAttempts(mine);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setError(e instanceof Error ? e.message : "Failed to load training runs");
      setAttempts([]);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => abortRef.current?.abort();
  }, [open, load]);

  return (
    <SlideOverPanel
      open={open}
      onClose={onClose}
      title="Training"
      headerAction={
        <button
          type="button"
          aria-label="Refresh"
          disabled={loading}
          onClick={() => void load()}
          className="rounded-lg p-1.5 text-[#909090] transition-colors hover:bg-[#1a1a1a] hover:text-white disabled:opacity-50"
        >
          <RefreshCw
            className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            strokeWidth={1.5}
          />
        </button>
      }
    >
      {error && (
        <div className="mx-4 mt-4 rounded-lg border border-[#5b2626] bg-[#2a1414] px-3 py-2 text-xs text-[#f0a8a8]">
          {error}
        </div>
      )}

      {loading && attempts.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-[#909090]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading…
        </div>
      ) : attempts.length === 0 ? (
        <div className="flex h-40 items-center justify-center px-4 text-center text-sm text-[#808080]">
          No training runs yet.
        </div>
      ) : (
        <ul className="divide-y divide-[#252525]">
          {attempts.map((attempt) => (
            <AttemptRow key={attempt.attemptId} attempt={attempt} />
          ))}
        </ul>
      )}
    </SlideOverPanel>
  );
}

function AttemptRow({ attempt }: { attempt: AdminAttempt }) {
  const badge =
    STATUS_BADGE[attempt.status] ?? {
      label: attempt.status || "—",
      tile: "#262626",
      text: "#a3a3a3",
    };
  const pct =
    typeof attempt.progressPercent === "number"
      ? Math.max(0, Math.min(100, attempt.progressPercent))
      : null;

  return (
    <li className="px-4 py-3 transition-colors hover:bg-[#1a1a1a]">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-white">
          {truncateName(attempt.sceneName ?? attempt.parentSceneId)}
        </p>
        <span
          className="shrink-0 rounded-md px-2 py-0.5 font-sw-mono text-[10px] font-semibold uppercase tracking-wide"
          style={{ backgroundColor: badge.tile, color: badge.text }}
        >
          {badge.label}
        </span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-[#909090]">
        <span className="font-sw-mono tabular-nums">
          {pct != null ? `${pct}%` : "—"}
        </span>
        <span className="font-sw-mono">{formatWhen(attempt.updatedAt)}</span>
      </div>
    </li>
  );
}
