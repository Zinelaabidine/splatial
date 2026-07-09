"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

type ConfirmActionDialogProps = {
  title: string;
  description: React.ReactNode;
  /** Label for the confirm button, e.g. "Suspend account". */
  confirmLabel: string;
  /** Visual tone — destructive actions render in red, warning in amber. */
  tone?: "default" | "warning" | "destructive";
  /** Whether a free-text reason is required before the confirm button enables. */
  requireReason?: boolean;
  /**
   * If set, the confirm button stays disabled until the user types this
   * exact string into a confirmation field (typed-confirmation guardrail for
   * hard delete).
   */
  requireTypedConfirmation?: string;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
};

export default function ConfirmActionDialog({
  title,
  description,
  confirmLabel,
  tone = "default",
  requireReason = true,
  requireTypedConfirmation,
  busy = false,
  error,
  onCancel,
  onConfirm,
}: ConfirmActionDialogProps) {
  const [reason, setReason] = useState("");
  const [typedConfirmation, setTypedConfirmation] = useState("");

  const reasonOk = !requireReason || reason.trim().length > 0;
  const typedOk = !requireTypedConfirmation || typedConfirmation.trim() === requireTypedConfirmation;
  const canConfirm = reasonOk && typedOk && !busy;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              tone === "destructive"
                ? "bg-red-950/50"
                : tone === "warning"
                  ? "bg-amber-950/40"
                  : "bg-teal-950/30"
            }`}
          >
            <AlertTriangle
              className={`h-5 w-5 ${
                tone === "destructive"
                  ? "text-red-400"
                  : tone === "warning"
                    ? "text-amber-400"
                    : "text-teal-400"
              }`}
            />
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
            <div className="mt-1 text-sm text-zinc-400">{description}</div>
          </div>
        </div>

        {requireReason && (
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-zinc-500">
              Reason {requireReason && <span className="text-red-400">*</span>}
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Why are you taking this action? (recorded in the audit log)"
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-teal-500/60 focus:ring-1 focus:ring-teal-500/30"
            />
          </div>
        )}

        {requireTypedConfirmation && (
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-zinc-500">
              Type <span className="font-mono text-red-400">{requireTypedConfirmation}</span> to confirm
            </label>
            <input
              type="text"
              value={typedConfirmation}
              onChange={(e) => setTypedConfirmation(e.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-teal-500/60 focus:ring-1 focus:ring-teal-500/30"
            />
          </div>
        )}

        {error && (
          <p className="mb-3 rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => onConfirm(reason.trim())}
            className={`inline-flex items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
              tone === "destructive"
                ? "border border-red-700/50 bg-red-900/50 text-red-200 hover:bg-red-900/70"
                : tone === "warning"
                  ? "border border-amber-600/40 bg-amber-950/40 text-amber-300 hover:bg-amber-950/60"
                  : "border border-teal-600/40 bg-teal-600/20 text-teal-300 hover:bg-teal-600/30"
            }`}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
