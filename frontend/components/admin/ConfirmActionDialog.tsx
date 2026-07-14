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
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--nord-scrim)] p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-xl border border-[var(--nord-hairline)] bg-[var(--nord-surface)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              tone === "destructive"
                ? "bg-[var(--nord-danger-tint)]"
                : tone === "warning"
                  ? "bg-[#f4ecd6]"
                  : "bg-[var(--nord-pine-tint)]"
            }`}
          >
            <AlertTriangle
              className={`h-5 w-5 ${
                tone === "destructive"
                  ? "text-[var(--nord-danger)]"
                  : tone === "warning"
                    ? "text-amber-400"
                    : "text-[var(--nord-teal)]"
              }`}
            />
          </div>
          <div>
            <h2 className="text-base font-semibold text-[var(--nord-ink)]">{title}</h2>
            <div className="mt-1 text-sm text-[var(--nord-slate)]">{description}</div>
          </div>
        </div>

        {requireReason && (
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-[var(--nord-slate)]">
              Reason {requireReason && <span className="text-[var(--nord-danger)]">*</span>}
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Why are you taking this action? (recorded in the audit log)"
              className="w-full rounded-md border border-[var(--nord-hairline)] bg-[var(--nord-bg)] px-3 py-2 text-sm text-[var(--nord-ink)] outline-none placeholder:text-[var(--nord-slate-soft)] focus:border-[var(--nord-teal)] focus:ring-1 focus:ring-[var(--nord-teal)]"
            />
          </div>
        )}

        {requireTypedConfirmation && (
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-[var(--nord-slate)]">
              Type <span className="font-mono text-[var(--nord-danger)]">{requireTypedConfirmation}</span> to confirm
            </label>
            <input
              type="text"
              value={typedConfirmation}
              onChange={(e) => setTypedConfirmation(e.target.value)}
              className="w-full rounded-md border border-[var(--nord-hairline)] bg-[var(--nord-bg)] px-3 py-2 text-sm text-[var(--nord-ink)] outline-none focus:border-[var(--nord-teal)] focus:ring-1 focus:ring-[var(--nord-teal)]"
            />
          </div>
        )}

        {error && (
          <p className="mb-3 rounded-md border border-[var(--nord-danger)] bg-[var(--nord-danger-tint)] px-3 py-2 text-sm text-[var(--nord-danger)]">
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-md border border-[var(--nord-hairline)] bg-[var(--nord-surface)] px-4 py-2 text-sm font-medium text-[var(--nord-ink)] transition-colors hover:bg-[var(--nord-surface)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => onConfirm(reason.trim())}
            className={`inline-flex items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
              tone === "destructive"
                ? "border border-[var(--nord-danger)] bg-[var(--nord-danger-tint)] text-[var(--nord-danger)] hover:bg-[var(--nord-danger-tint)]"
                : tone === "warning"
                  ? "border border-amber-600/40 bg-[#f4ecd6] text-[#9a6b1f] hover:bg-[#f4ecd6]"
                  : "border border-[var(--nord-teal)] bg-[var(--nord-pine)] text-[var(--nord-teal)] hover:bg-[var(--nord-pine)]"
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
