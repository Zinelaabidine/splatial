"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

type ConfirmActionDialogProps = {
  title: string;
  description: React.ReactNode;
  /** Label for the confirm button, e.g. "Suspend account". */
  confirmLabel: string;
  /** Visual tone — destructive actions render in red. */
  tone?: "default" | "destructive";
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
        className="w-full max-w-md rounded-xl border border-[#2a2a2a] bg-[#161616] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              tone === "destructive" ? "bg-[#3a1a1a]" : "bg-[#1a2a3a]"
            }`}
          >
            <AlertTriangle
              className={`h-5 w-5 ${tone === "destructive" ? "text-[#e08a8a]" : "text-[#8ab4e0]"}`}
            />
          </div>
          <div>
            <h2 className="text-base font-semibold text-[#f1f1f1]">{title}</h2>
            <div className="mt-1 text-sm text-[#a0a0a0]">{description}</div>
          </div>
        </div>

        {requireReason && (
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-[#909090]">
              Reason {requireReason && <span className="text-[#e08a8a]">*</span>}
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Why are you taking this action? (recorded in the audit log)"
              className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-[#e8e8e8] outline-none placeholder:text-[#606060] focus:border-[#3b82f6]"
            />
          </div>
        )}

        {requireTypedConfirmation && (
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-[#909090]">
              Type <span className="font-mono text-[#e08a8a]">{requireTypedConfirmation}</span> to confirm
            </label>
            <input
              type="text"
              value={typedConfirmation}
              onChange={(e) => setTypedConfirmation(e.target.value)}
              className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-[#e8e8e8] outline-none focus:border-[#3b82f6]"
            />
          </div>
        )}

        {error && (
          <p className="mb-3 rounded-lg border border-[#5b2626] bg-[#2a1414] px-3 py-2 text-sm text-[#f0a8a8]">
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-2 text-sm font-medium text-[#e8e8e8] transition-colors hover:bg-[#222] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => onConfirm(reason.trim())}
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50 ${
              tone === "destructive" ? "bg-[#c23a3a] hover:bg-[#a83030]" : "bg-[#3b82f6] hover:bg-[#2f6fd6]"
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
