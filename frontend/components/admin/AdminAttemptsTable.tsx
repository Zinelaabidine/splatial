"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, Server } from "lucide-react";

import AttemptLogPanel from "@/components/admin/AttemptLogPanel";
import type { AdminAttempt } from "@/types/admin";

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  QUEUED: { label: "Queued", className: "bg-indigo-100 text-indigo-700" },
  PROCESSING: { label: "Processing", className: "bg-yellow-100 text-[#9a6b1f]" },
  READY: { label: "Ready", className: "bg-blue-100 text-blue-700" },
  FAILED: { label: "Failed", className: "bg-red-100 text-red-700" },
  CANCELLED: { label: "Cancelled", className: "bg-[var(--nord-surface-2)] text-[var(--nord-slate-soft)]" },
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? {
    label: status || "—",
    className: "bg-[var(--nord-surface-2)] text-[var(--nord-slate-soft)]",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style.className}`}
    >
      {style.label}
    </span>
  );
}

function shortId(id: string | null, head = 8): string {
  if (!id) return "—";
  return id.length > head + 2 ? `${id.slice(0, head)}…` : id;
}

function formatWhen(iso: string | null): string {
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

function ProgressCell({ attempt }: { attempt: AdminAttempt }) {
  const pct =
    typeof attempt.progressPercent === "number"
      ? Math.max(0, Math.min(100, attempt.progressPercent))
      : null;
  const phase = attempt.progressPhase ?? null;
  if (pct == null && !phase) return <span className="text-[var(--nord-slate-soft)]">—</span>;
  return (
    <div className="min-w-[120px]">
      <div className="mb-1 flex items-center justify-between gap-2 text-xs text-[var(--nord-slate)]">
        <span className="truncate">{phase ?? ""}</span>
        {pct != null && <span className="tabular-nums">{pct}%</span>}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--nord-surface)]">
        <div
          className="h-full rounded-full bg-[#3b82f6] transition-all"
          style={{ width: `${pct ?? 0}%` }}
        />
      </div>
    </div>
  );
}

/** Expandable detail row. The CloudWatch log panel lands here in Phase 3. */
function DetailPanel({ attempt }: { attempt: AdminAttempt }) {
  return (
    <div className="space-y-3 bg-[var(--nord-bg)] px-4 py-4 text-sm">
      <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
        <Detail label="Attempt ID" value={attempt.attemptId} mono />
        <Detail label="Parent scene" value={attempt.parentSceneId} mono />
        <Detail label="User" value={attempt.userId} mono />
        <Detail label="Spot request" value={attempt.spotRequestId} mono />
        <Detail label="Instance" value={attempt.ec2InstanceId} mono />
        <Detail label="Worker version" value={attempt.workerVersion ?? null} mono />
        <Detail label="Created" value={formatWhen(attempt.createdAt)} />
      </div>

      {(attempt.failureReason || attempt.errorMessage) && (
        <div className="rounded-lg border border-[var(--nord-danger)] bg-[var(--nord-danger-tint)] px-3 py-2 text-[var(--nord-danger)]">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--nord-danger)]">
            {attempt.failureReason ?? "Error"}
          </div>
          {attempt.errorMessage && (
            <div className="mt-1 break-words font-mono text-xs">
              {attempt.errorMessage}
            </div>
          )}
        </div>
      )}

      <AttemptLogPanel attempt={attempt} />
    </div>
  );
}

function Detail({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-28 shrink-0 text-xs uppercase tracking-wide text-[var(--nord-slate-soft)]">
        {label}
      </span>
      <span
        className={`break-all text-[var(--nord-ink)] ${mono ? "font-mono text-xs" : ""}`}
      >
        {value ?? "—"}
      </span>
    </div>
  );
}

export default function AdminAttemptsTable({
  attempts,
}: {
  attempts: AdminAttempt[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--nord-hairline)]">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="bg-[var(--nord-surface)] text-xs uppercase tracking-wide text-[var(--nord-slate)]">
            <th className="w-8 px-3 py-3" />
            <th className="px-3 py-3 font-medium">Scene / attempt</th>
            <th className="px-3 py-3 font-medium">Status</th>
            <th className="px-3 py-3 font-medium">Progress</th>
            <th className="px-3 py-3 font-medium">Instance</th>
            <th className="px-3 py-3 font-medium">Updated</th>
          </tr>
        </thead>
        <tbody>
          {attempts.map((a) => {
            const open = openId === a.attemptId;
            return (
              <Fragment key={a.attemptId}>
                <tr
                  onClick={() => setOpenId(open ? null : a.attemptId)}
                  className={`cursor-pointer border-t border-[var(--nord-hairline)] transition-colors hover:bg-[var(--nord-surface)] ${
                    open ? "bg-[var(--nord-surface)]" : ""
                  }`}
                >
                  <td className="px-3 py-3 align-middle text-[var(--nord-slate)]">
                    {open ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <div className="font-medium text-[var(--nord-ink)]">
                      {a.sceneName || shortId(a.parentSceneId)}
                    </div>
                    <div className="font-mono text-xs text-[var(--nord-slate)]">
                      {shortId(a.attemptId)}
                      {a.attemptNumber != null && (
                        <span className="ml-1 text-[var(--nord-slate-soft)]">
                          · #{a.attemptNumber}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <StatusBadge status={a.status} />
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <ProgressCell attempt={a} />
                  </td>
                  <td className="px-3 py-3 align-middle">
                    {a.ec2InstanceId ? (
                      <span className="inline-flex items-center gap-1.5 font-mono text-xs text-[var(--nord-slate)]">
                        <Server className="h-3.5 w-3.5 text-[var(--nord-slate-soft)]" />
                        {shortId(a.ec2InstanceId, 12)}
                      </span>
                    ) : (
                      <span className="text-[var(--nord-slate-soft)]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 align-middle whitespace-nowrap text-[var(--nord-slate)]">
                    {formatWhen(a.updatedAt)}
                  </td>
                </tr>
                {open && (
                  <tr>
                    <td colSpan={6} className="border-t border-[var(--nord-hairline)] p-0">
                      <DetailPanel attempt={a} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
