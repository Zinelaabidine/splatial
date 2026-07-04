"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, ShieldAlert, Rocket, History } from "lucide-react";

import { useIsAdmin } from "@/lib/auth/useIsAdmin";
import { getAsgConfig, updateAsgConfig } from "@/services/adminService";
import type { AdminAsgConfigResponse } from "@/types/admin";

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

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-[#808080]">{label}</div>
      <div className="mt-1 text-lg font-semibold text-[#f1f1f1]">{value}</div>
    </div>
  );
}

export default function AdminAsgConfigView() {
  const isAdmin = useIsAdmin();

  const [config, setConfig] = useState<AdminAsgConfigResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [amiId, setAmiId] = useState("");
  const [instanceType, setInstanceType] = useState("");
  const [maxSize, setMaxSize] = useState("");
  const [reason, setReason] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setLoadError(null);
    try {
      const res = await getAsgConfig(controller.signal);
      setConfig(res);
      setAmiId(res.current.amiId ?? "");
      setInstanceType(res.current.instanceType ?? "");
      setMaxSize(String(res.asg.maxSize));
    } catch (e) {
      if (controller.signal.aborted) return;
      setLoadError(e instanceof Error ? e.message : "Failed to load ASG config");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin === true) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      load();
    }
    return () => abortRef.current?.abort();
  }, [isAdmin, load]);

  const changed =
    !!config &&
    (amiId.trim() !== (config.current.amiId ?? "") ||
      instanceType.trim() !== (config.current.instanceType ?? "") ||
      Number(maxSize) !== config.asg.maxSize);

  async function applyChanges() {
    if (!config) return;
    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);
    try {
      const payload: {
        amiId?: string;
        instanceType?: string;
        maxSize?: number;
        reason?: string;
      } = {};
      if (amiId.trim() !== (config.current.amiId ?? "")) payload.amiId = amiId.trim();
      if (instanceType.trim() !== (config.current.instanceType ?? ""))
        payload.instanceType = instanceType.trim();
      if (Number(maxSize) !== config.asg.maxSize) payload.maxSize = Number(maxSize);
      if (reason.trim()) payload.reason = reason.trim();

      await updateAsgConfig(payload);
      setSubmitSuccess(
        "Applied. New worker launches will use this configuration immediately — no deploy needed.",
      );
      setConfirmOpen(false);
      setReason("");
      await load();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Failed to apply changes");
    } finally {
      setSubmitting(false);
    }
  }

  function applyHistoryVersion(amiId2: string | null, instanceType2: string | null) {
    if (amiId2) setAmiId(amiId2);
    if (instanceType2) setInstanceType(instanceType2);
  }

  if (isAdmin === null) {
    return (
      <div className="flex h-64 items-center justify-center text-[#909090]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Checking access…
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="mx-auto mt-16 flex max-w-md flex-col items-center rounded-xl border border-[#2a2a2a] bg-[#161616] px-6 py-10 text-center">
        <ShieldAlert className="mb-3 h-8 w-8 text-[#d98a8a]" />
        <h2 className="text-lg font-semibold text-[#f1f1f1]">Admin access required</h2>
        <p className="mt-1 text-sm text-[#909090]">
          Your account isn’t in the admin group. Ask an operator to add you, then sign
          out and back in.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#f1f1f1]">
            GPU worker ASG config
          </h1>
          <p className="text-sm text-[#909090]">
            Change the AMI, instance type, or max fleet size live. Takes effect on the
            next scale-out — no Terraform apply or deploy.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-[#e8e8e8] transition-colors hover:bg-[#222] disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {loadError && (
        <div className="mb-4 rounded-lg border border-[#5b2626] bg-[#2a1414] px-4 py-3 text-sm text-[#f0a8a8]">
          {loadError}
        </div>
      )}

      {loading && !config ? (
        <div className="flex h-64 items-center justify-center text-[#909090]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading ASG config…
        </div>
      ) : config ? (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="In service" value={config.asg.inServiceInstances} />
            <StatCard label="Desired" value={config.asg.desiredCapacity} />
            <StatCard label="Max size" value={config.asg.maxSize} />
            <StatCard label="Min size" value={config.asg.minSize} />
          </div>

          <div className="mb-6 rounded-xl border border-[#2a2a2a] bg-[#161616] p-5">
            <h2 className="mb-4 text-sm font-semibold text-[#f1f1f1]">
              Update configuration
            </h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-[#808080]">
                  AMI ID
                </label>
                <input
                  value={amiId}
                  onChange={(e) => setAmiId(e.target.value)}
                  placeholder="ami-xxxxxxxxxxxxxxxxx"
                  className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 font-mono text-sm text-[#e8e8e8] outline-none focus:border-[#3b82f6]"
                />
                {config.current.amiName && (
                  <p className="mt-1 truncate text-xs text-[#707070]">
                    Current: {config.current.amiName} ({config.current.architecture ?? "—"})
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-[#808080]">
                  Instance type
                </label>
                <input
                  value={instanceType}
                  onChange={(e) => setInstanceType(e.target.value)}
                  placeholder="g5g.xlarge"
                  className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 font-mono text-sm text-[#e8e8e8] outline-none focus:border-[#3b82f6]"
                />
                <p className="mt-1 text-xs text-[#707070]">
                  Must match the AMI&apos;s CPU architecture (validated on submit).
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-[#808080]">
                  Max ASG size
                </label>
                <input
                  type="number"
                  min={0}
                  max={config.asg.maxSizeCap}
                  value={maxSize}
                  onChange={(e) => setMaxSize(e.target.value)}
                  className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-[#e8e8e8] outline-none focus:border-[#3b82f6]"
                />
                <p className="mt-1 text-xs text-[#707070]">
                  Hard cap: {config.asg.maxSizeCap} (Spot GPU instances only).
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-[#808080]">
                  Reason (optional, shown in version history)
                </label>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. rolling out fixed COLMAP timeout"
                  className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-[#e8e8e8] outline-none focus:border-[#3b82f6]"
                />
              </div>
            </div>

            {submitError && (
              <div className="mt-4 rounded-lg border border-[#5b2626] bg-[#2a1414] px-3 py-2 text-sm text-[#f0a8a8]">
                {submitError}
              </div>
            )}
            {submitSuccess && (
              <div className="mt-4 rounded-lg border border-[#1f4d2e] bg-[#122016] px-3 py-2 text-sm text-[#8fd6a3]">
                {submitSuccess}
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                disabled={!changed || submitting}
                onClick={() => setConfirmOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-[#3b82f6] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2f6fd6] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Rocket className="h-4 w-4" />
                Apply changes
              </button>
            </div>

            {confirmOpen && (
              <div className="mt-4 rounded-lg border border-[#3a3312] bg-[#211d0d] px-4 py-3 text-sm text-[#e8d98a]">
                <p className="mb-3">
                  This affects every new GPU worker instance launched from now on.
                  Confirm the change?
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmOpen(false)}
                    className="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-[#e8e8e8] hover:bg-[#1a1a1a]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={applyChanges}
                    disabled={submitting}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#3b82f6] px-3 py-1.5 font-medium text-white hover:bg-[#2f6fd6] disabled:opacity-50"
                  >
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    Confirm
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[#2a2a2a]">
            <div className="flex items-center gap-2 border-b border-[#2a2a2a] bg-[#1a1a1a] px-4 py-3">
              <History className="h-4 w-4 text-[#808080]" />
              <h2 className="text-sm font-semibold text-[#f1f1f1]">
                Launch template version history
              </h2>
            </div>
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-[#808080]">
                  <th className="px-4 py-2 font-medium">Version</th>
                  <th className="px-4 py-2 font-medium">AMI</th>
                  <th className="px-4 py-2 font-medium">Instance type</th>
                  <th className="px-4 py-2 font-medium">Description</th>
                  <th className="px-4 py-2 font-medium">Created</th>
                  <th className="px-4 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {config.history.map((h) => (
                  <tr key={h.version} className="border-t border-[#242424]">
                    <td className="px-4 py-2 align-middle text-[#e8e8e8]">
                      {h.version}
                      {h.version === config.launchTemplate.latestVersion && (
                        <span className="ml-2 rounded-full bg-[#1f4d2e] px-2 py-0.5 text-xs text-[#8fd6a3]">
                          latest
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 align-middle font-mono text-xs text-[#b0b0b0]">
                      {h.amiId ?? "—"}
                    </td>
                    <td className="px-4 py-2 align-middle font-mono text-xs text-[#b0b0b0]">
                      {h.instanceType ?? "—"}
                    </td>
                    <td className="max-w-[220px] truncate px-4 py-2 align-middle text-xs text-[#808080]">
                      {h.description ?? "—"}
                    </td>
                    <td className="px-4 py-2 align-middle whitespace-nowrap text-xs text-[#808080]">
                      {formatWhen(h.createdAt)}
                    </td>
                    <td className="px-4 py-2 align-middle">
                      <button
                        type="button"
                        onClick={() => applyHistoryVersion(h.amiId, h.instanceType)}
                        className="rounded-lg border border-[#2a2a2a] px-2 py-1 text-xs text-[#e8e8e8] hover:bg-[#1a1a1a]"
                      >
                        Use this
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
