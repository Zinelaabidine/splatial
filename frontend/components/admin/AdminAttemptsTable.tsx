"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, Server } from "lucide-react";

import AttemptLogPanel from "@/components/admin/AttemptLogPanel";
import type { AdminAttempt } from "@/types/admin";

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  QUEUED: { label: "Queued", className: "bg-indigo-100 text-indigo-700" },
  PROCESSING: { label: "Processing", className: "bg-yellow-100 text-yellow-700" },
  READY: { label: "Ready", className: "bg-blue-100 text-blue-700" },
  FAILED: { label: "Failed", className: "bg-red-100 text-red-700" },
  CANCELLED: { label: "Cancelled", className: "bg-slate-200 text-slate-600" },
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? {
    label: status || "—",
    className: "bg-slate-200 text-slate-600",
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
  if (pct == null && !phase) return <span className="text-[#707070]">—</span>;
  return (
    <div className="min-w-[120px]">
      <div className="mb-1 flex items-center justify-between gap-2 text-xs text-[#b0b0b0]">
        <span className="truncate">{phase ?? ""}</span>
        {pct != null && <span className="tabular-nums">{pct}%</span>}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#2a2a2a]">
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
    <div className="space-y-3 bg-[#161616] px-4 py-4 text-sm">
      <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
        <Detail label="Attempt ID" value={attempt.attemptId} mono />
        <Detail label="Parent scene" value={attempt.parentSceneId} mono />
        <Detail label="User" value={attempt.userId} mono />
        <Detail label="Spot request" value={attempt.spotRequestId} mono />
        <Detail label="Instance" value={attempt.ec2InstanceId} mono />
        <Detail label="Created" value={formatWhen(attempt.createdAt)} />
      </div>

      {(attempt.failureReason || attempt.errorMessage) && (
        <div className="rounded-lg border border-[#5b2626] bg-[#2a1414] px-3 py-2 text-[#f0a8a8]">
          <div className="text-xs font-semibold uppercase tracking-wide text-[#d98a8a]">
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
      <span className="w-28 shrink-0 text-xs uppercase tracking-wide text-[#707070]">
        {label}
      </span>
      <span
        className={`break-all text-[#d8d8d8] ${mono ? "font-mono text-xs" : ""}`}
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
    <div className="overflow-hidden rounded-xl border border-[#2a2a2a]">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="bg-[#1a1a1a] text-xs uppercase tracking-wide text-[#808080]">
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
                  className={`cursor-pointer border-t border-[#242424] transition-colors hover:bg-[#1c1c1c] ${
                    open ? "bg-[#1c1c1c]" : ""
                  }`}
                >
                  <td className="px-3 py-3 align-middle text-[#808080]">
                    {open ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <div className="font-medium text-[#f1f1f1]">
                      {a.sceneName || shortId(a.parentSceneId)}
                    </div>
                    <div className="font-mono text-xs text-[#808080]">
                      {shortId(a.attemptId)}
                      {a.attemptNumber != null && (
                        <span className="ml-1 text-[#606060]">
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
                      <span className="inline-flex items-center gap-1.5 font-mono text-xs text-[#b0b0b0]">
                        <Server className="h-3.5 w-3.5 text-[#707070]" />
                        {shortId(a.ec2InstanceId, 12)}
                      </span>
                    ) : (
                      <span className="text-[#707070]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 align-middle whitespace-nowrap text-[#b0b0b0]">
                    {formatWhen(a.updatedAt)}
                  </td>
                </tr>
                {open && (
                  <tr>
                    <td colSpan={6} className="border-t border-[#242424] p-0">
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
