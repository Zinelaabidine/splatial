"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  RefreshCw,
  ShieldAlert,
  Rocket,
  History,
  Power,
  StopCircle,
  AlertTriangle,
  Terminal,
  ExternalLink,
  Copy,
  Check,
  Plus,
  Pencil,
} from "lucide-react";

import { useIsAdmin } from "@/lib/auth/useIsAdmin";
import {
  getAsgConfig,
  updateAsgConfig,
  bootWorker,
  releaseWorker,
  getSpotPrice,
  listWorkerAmis,
  registerWorkerAmi,
} from "@/services/adminService";
import type {
  AdminAsgConfigResponse,
  AdminAsgInstance,
  SpotPriceResponse,
  WorkerAmi,
} from "@/types/admin";

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

function formatElapsed(sinceIso: string | null): string | null {
  if (!sinceIso) return null;
  const since = new Date(sinceIso).getTime();
  if (Number.isNaN(since)) return null;
  const minutes = Math.max(0, Math.round((Date.now() - since) / 60000));
  if (minutes < 60) return `${minutes}m`;
  return `${(minutes / 60).toFixed(1)}h`;
}

const INSTANCE_TYPE_RE = /^[a-z0-9]+\.[a-z0-9]+$/;

// GPU worker fleet is deliberately limited to these two ARM Spot types — keep
// in sync with ALLOWED_INSTANCE_TYPES in admin-asg-config-update.js.
const INSTANCE_TYPE_OPTIONS = [
  { value: "g5g.xlarge", label: "g5g.xlarge — routine jobs" },
  { value: "g5g.16xlarge", label: "g5g.16xlarge — heavier/faster processing" },
] as const;

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-[#808080]">{label}</div>
      <div className="mt-1 text-lg font-semibold text-[#f1f1f1]">{value}</div>
    </div>
  );
}

function InstancesPanel({ instances }: { instances: AdminAsgInstance[] }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copyCommand(instanceId: string, command: string) {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedId(instanceId);
      setTimeout(() => setCopiedId((cur) => (cur === instanceId ? null : cur)), 2000);
    } catch {
      /* clipboard API unavailable (non-secure context, permissions) — ignore */
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-[#2a2a2a]">
      <div className="border-b border-[#2a2a2a] bg-[#1a1a1a] px-4 py-3">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-[#808080]" />
          <h2 className="text-sm font-semibold text-[#f1f1f1]">Connect to a worker</h2>
        </div>
        <p className="mt-1 text-xs text-[#808080]">
          Access via SSM Session Manager always works (AWS CLI with the Session Manager
          plugin, or the EC2 console&apos;s &quot;Connect&quot; tab). In this environment,
          direct SSH with the GaussianWorker key pair is also available where an instance
          has a public IP.
        </p>
      </div>

      {instances.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-[#707070]">
          No instances running. Boot one below, or wait for a real job to trigger
          scale-out.
        </div>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-[#808080]">
              <th className="px-4 py-2 font-medium">Instance</th>
              <th className="px-4 py-2 font-medium">State</th>
              <th className="px-4 py-2 font-medium">AZ</th>
              <th className="px-4 py-2 font-medium">Private IP</th>
              <th className="px-4 py-2 font-medium">Connect</th>
            </tr>
          </thead>
          <tbody>
            {instances.map((inst) => (
              <tr key={inst.instanceId} className="border-t border-[#242424]">
                <td className="px-4 py-2 align-middle font-mono text-xs text-[#e8e8e8]">
                  {inst.instanceId}
                </td>
                <td className="px-4 py-2 align-middle text-xs text-[#b0b0b0]">
                  {inst.lifecycleState}
                </td>
                <td className="px-4 py-2 align-middle text-xs text-[#b0b0b0]">
                  {inst.availabilityZone ?? "—"}
                </td>
                <td className="px-4 py-2 align-middle font-mono text-xs text-[#b0b0b0]">
                  {inst.privateIp ?? "—"}
                </td>
                <td className="px-4 py-2 align-middle">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => copyCommand(inst.instanceId, inst.ssmCommand)}
                      title={inst.ssmCommand}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#2a2a2a] px-2 py-1 text-xs text-[#e8e8e8] hover:bg-[#1a1a1a]"
                    >
                      {copiedId === inst.instanceId ? (
                        <Check className="h-3.5 w-3.5 text-[#8fd6a3]" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      {copiedId === inst.instanceId ? "Copied" : "Copy SSM command"}
                    </button>
                    {inst.sshCommand && (
                      <button
                        type="button"
                        onClick={() =>
                          copyCommand(`${inst.instanceId}-ssh`, inst.sshCommand as string)
                        }
                        title={inst.sshCommand}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#2a2a2a] px-2 py-1 text-xs text-[#e8e8e8] hover:bg-[#1a1a1a]"
                      >
                        {copiedId === `${inst.instanceId}-ssh` ? (
                          <Check className="h-3.5 w-3.5 text-[#8fd6a3]" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        {copiedId === `${inst.instanceId}-ssh` ? "Copied" : "Copy SSH command"}
                      </button>
                    )}
                    <a
                      href={inst.consoleUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#2a2a2a] px-2 py-1 text-xs text-[#e8e8e8] hover:bg-[#1a1a1a]"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Console
                    </a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const AMI_ID_INPUT_RE = /^ami-[a-f0-9]{8,17}$/;

/**
 * Dropdown of registered worker AMIs (the DB-backed registry — never a live
 * AWS catalog listing) plus an inline "register a new AMI" mini-form and a
 * manual-entry escape hatch for an AMI that hasn't been registered yet.
 */
function AmiPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (amiId: string) => void;
}) {
  const [amis, setAmis] = useState<WorkerAmi[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [manualEntry, setManualEntry] = useState(false);

  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [newAmiId, setNewAmiId] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newReason, setNewReason] = useState("");
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  const [showManage, setShowManage] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await listWorkerAmis(controller.signal);
      setAmis(res.items);
    } catch (e) {
      if (controller.signal.aborted) return;
      setLoadError(e instanceof Error ? e.message : "Failed to load AMI registry");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  // If the current value isn't in the registry (e.g. loaded from launch
  // template history, or a fresh manual entry), fall back to manual mode so
  // it's still visible/editable rather than silently reverting to blank.
  useEffect(() => {
    if (!loading && value && !amis.some((a) => a.amiId === value)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setManualEntry(true);
    }
  }, [amis, loading, value]);

  async function handleRegister() {
    setRegistering(true);
    setRegisterError(null);
    try {
      const created = await registerWorkerAmi({
        amiId: newAmiId.trim(),
        label: newLabel.trim(),
        ...(newReason.trim() ? { reason: newReason.trim() } : {}),
      });
      setAmis((prev) => [created, ...prev]);
      onChange(created.amiId);
      setManualEntry(false);
      setShowRegisterForm(false);
      setNewAmiId("");
      setNewLabel("");
      setNewReason("");
    } catch (e) {
      setRegisterError(e instanceof Error ? e.message : "Failed to register AMI");
    } finally {
      setRegistering(false);
    }
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="block text-xs uppercase tracking-wide text-[#808080]">
          AMI
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setManualEntry((v) => !v)}
            className="text-xs text-[#7fa8e0] hover:underline"
          >
            {manualEntry ? "Choose from list" : "Enter AMI ID manually"}
          </button>
        </div>
      </div>

      {manualEntry ? (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="ami-xxxxxxxxxxxxxxxxx"
          className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 font-mono text-sm text-[#e8e8e8] outline-none focus:border-[#3b82f6]"
        />
      ) : (
        <select
          value={amis.some((a) => a.amiId === value) ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={loading}
          className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 font-mono text-sm text-[#e8e8e8] outline-none focus:border-[#3b82f6] disabled:opacity-50"
        >
          <option value="" disabled>
            {loading ? "Loading…" : "Select a registered AMI"}
          </option>
          {amis.map((a) => (
            <option key={a.amiId} value={a.amiId}>
              {a.label} — {a.amiId}
              {a.architecture ? ` (${a.architecture})` : ""}
            </option>
          ))}
        </select>
      )}

      {loadError && (
        <p className="mt-1 text-xs text-[#f0a8a8]">{loadError}</p>
      )}

      <div className="mt-1.5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setShowRegisterForm((v) => !v)}
          className="inline-flex items-center gap-1 text-xs text-[#7fa8e0] hover:underline"
        >
          <Plus className="h-3 w-3" />
          Register a new AMI
        </button>
        {amis.length > 0 && (
          <button
            type="button"
            onClick={() => setShowManage((v) => !v)}
            className="inline-flex items-center gap-1 text-xs text-[#7fa8e0] hover:underline"
          >
            <Pencil className="h-3 w-3" />
            Manage list ({amis.length})
          </button>
        )}
      </div>

      {showRegisterForm && (
        <div className="mt-3 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              value={newAmiId}
              onChange={(e) => setNewAmiId(e.target.value)}
              placeholder="ami-xxxxxxxxxxxxxxxxx"
              className="rounded-lg border border-[#2a2a2a] bg-[#141414] px-3 py-2 font-mono text-xs text-[#e8e8e8] outline-none focus:border-[#3b82f6]"
            />
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Label, e.g. v12 - depth priors"
              className="rounded-lg border border-[#2a2a2a] bg-[#141414] px-3 py-2 text-xs text-[#e8e8e8] outline-none focus:border-[#3b82f6]"
            />
          </div>
          <input
            value={newReason}
            onChange={(e) => setNewReason(e.target.value)}
            placeholder="Reason (optional)"
            className="mt-2 w-full rounded-lg border border-[#2a2a2a] bg-[#141414] px-3 py-2 text-xs text-[#e8e8e8] outline-none focus:border-[#3b82f6]"
          />
          <p className="mt-1.5 text-[11px] text-[#707070]">
            Checked against EC2 once (existence + state) before it&apos;s saved to the
            registry — this doesn&apos;t list or browse AWS&apos;s AMI catalog.
          </p>
          {registerError && (
            <p className="mt-1.5 text-xs text-[#f0a8a8]">{registerError}</p>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowRegisterForm(false)}
              className="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-[#e8e8e8] hover:bg-[#1f1f1f]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={
                registering ||
                !AMI_ID_INPUT_RE.test(newAmiId.trim()) ||
                !newLabel.trim()
              }
              onClick={handleRegister}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#3b82f6] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2f6fd6] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {registering && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Register
            </button>
          </div>
        </div>
      )}

      {showManage && amis.length > 0 && (
        <ul className="mt-3 divide-y divide-[#242424] rounded-lg border border-[#2a2a2a]">
          {amis.map((a) => (
            <li key={a.amiId} className="px-3 py-2 text-xs">
              <div className="truncate text-[#e8e8e8]">{a.label}</div>
              <div className="truncate font-mono text-[#808080]">{a.amiId}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Admin page for the GPU worker ASG: live AMI/instance-type/max-size config
 * (instance type limited to g5g.xlarge / g5g.16xlarge), a manual boot/release
 * control for smoke-testing without waiting on a real SQS job, a connect
 * panel (SSM always, plus direct SSH where the environment opts in), queue-
 * depth and Spot-price context, and Slack/email alerts on changes or a
 * manual session left active too long.
 */
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

  const [bootCount, setBootCount] = useState("1");
  const [bootReason, setBootReason] = useState("");
  const [bootConfirmOpen, setBootConfirmOpen] = useState(false);
  const [bootSubmitting, setBootSubmitting] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [releaseSubmitting, setReleaseSubmitting] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);

  const [spotPrice, setSpotPrice] = useState<SpotPriceResponse | null>(null);
  const [spotPriceLoading, setSpotPriceLoading] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const spotAbortRef = useRef<AbortController | null>(null);

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

  // Debounced live Spot price lookup — fires whenever the instance type field
  // settles on a valid value (initial load included), so the estimate is
  // visible before the admin applies a change or boots a worker.
  useEffect(() => {
    const trimmed = instanceType.trim();
    if (!INSTANCE_TYPE_RE.test(trimmed)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSpotPrice(null);
      return;
    }
    const timer = setTimeout(() => {
      spotAbortRef.current?.abort();
      const controller = new AbortController();
      spotAbortRef.current = controller;
      setSpotPriceLoading(true);
      getSpotPrice(trimmed, controller.signal)
        .then((res) => {
          if (!controller.signal.aborted) setSpotPrice(res);
        })
        .catch(() => {
          if (!controller.signal.aborted) setSpotPrice(null);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSpotPriceLoading(false);
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [instanceType]);

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

  async function doBoot() {
    setBootSubmitting(true);
    setBootError(null);
    try {
      await bootWorker({
        count: Number(bootCount) || 1,
        reason: bootReason.trim() || undefined,
      });
      setBootConfirmOpen(false);
      setBootReason("");
      await load();
    } catch (e) {
      setBootError(e instanceof Error ? e.message : "Failed to boot worker");
    } finally {
      setBootSubmitting(false);
    }
  }

  async function doRelease() {
    setReleaseSubmitting(true);
    setReleaseError(null);
    try {
      await releaseWorker();
      await load();
    } catch (e) {
      setReleaseError(e instanceof Error ? e.message : "Failed to release");
    } finally {
      setReleaseSubmitting(false);
    }
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
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="In service" value={config.asg.inServiceInstances} />
            <StatCard label="Desired" value={config.asg.desiredCapacity} />
            <StatCard label="Max size" value={config.asg.maxSize} />
            <StatCard label="Min size" value={config.asg.minSize} />
            <StatCard
              label="Queue visible"
              value={config.queue.visible ?? "—"}
            />
            <StatCard
              label="Queue in-flight"
              value={config.queue.inFlight ?? "—"}
            />
          </div>

          {config.asg.manualModeActive && (
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#5b4a1a] bg-[#2a2210] px-4 py-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#e8b84a]" />
                <div className="text-sm text-[#e8d98a]">
                  <span className="font-medium">
                    Manual mode active
                    {formatElapsed(config.asg.manualModeSince) &&
                      ` (${formatElapsed(config.asg.manualModeSince)})`}
                    .
                  </span>{" "}
                  SQS-driven auto-scaling is paused — real jobs will queue but
                  won&apos;t launch a worker until you release.
                </div>
              </div>
              <button
                type="button"
                onClick={doRelease}
                disabled={releaseSubmitting}
                className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#e8b84a] px-3 py-1.5 text-sm font-medium text-[#2a2210] hover:bg-[#f0c65e] disabled:opacity-50"
              >
                {releaseSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <StopCircle className="h-4 w-4" />
                )}
                Release
              </button>
            </div>
          )}
          {releaseError && (
            <div className="mb-6 rounded-lg border border-[#5b2626] bg-[#2a1414] px-4 py-3 text-sm text-[#f0a8a8]">
              {releaseError}
            </div>
          )}

          <InstancesPanel instances={config.asg.instances} />

          <div className="mb-6 rounded-xl border border-[#2a2a2a] bg-[#161616] p-5">
            <h2 className="mb-1 text-sm font-semibold text-[#f1f1f1]">
              Manual worker boot
            </h2>
            <p className="mb-4 text-sm text-[#909090]">
              Force capacity up right now — e.g. to smoke-test the current AMI/instance
              type before real jobs hit the queue. Suspends SQS-driven scaling until you
              release.
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-[#808080]">
                  Worker count
                </label>
                <input
                  type="number"
                  min={1}
                  max={config.asg.maxSize}
                  value={bootCount}
                  onChange={(e) => setBootCount(e.target.value)}
                  className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-[#e8e8e8] outline-none focus:border-[#3b82f6]"
                />
                <p className="mt-1 text-xs text-[#707070]">
                  Capped at the current max size ({config.asg.maxSize}).
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-[#808080]">
                  Reason (optional)
                </label>
                <input
                  value={bootReason}
                  onChange={(e) => setBootReason(e.target.value)}
                  placeholder="e.g. smoke-test new AMI"
                  className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-[#e8e8e8] outline-none focus:border-[#3b82f6]"
                />
              </div>
            </div>

            {bootError && (
              <div className="mt-4 rounded-lg border border-[#5b2626] bg-[#2a1414] px-3 py-2 text-sm text-[#f0a8a8]">
                {bootError}
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                disabled={bootSubmitting || config.asg.maxSize < 1}
                onClick={() => setBootConfirmOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-[#3b82f6] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2f6fd6] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Power className="h-4 w-4" />
                Boot worker now
              </button>
            </div>

            {bootConfirmOpen && (
              <div className="mt-4 rounded-lg border border-[#3a3312] bg-[#211d0d] px-4 py-3 text-sm text-[#e8d98a]">
                <p className="mb-3">
                  This pauses SQS-driven auto-scaling until you click Release. Real jobs
                  submitted in the meantime will queue but won&apos;t launch a worker.
                  Continue?
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setBootConfirmOpen(false)}
                    className="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-[#e8e8e8] hover:bg-[#1a1a1a]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={doBoot}
                    disabled={bootSubmitting}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#3b82f6] px-3 py-1.5 font-medium text-white hover:bg-[#2f6fd6] disabled:opacity-50"
                  >
                    {bootSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    Confirm boot
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="mb-6 rounded-xl border border-[#2a2a2a] bg-[#161616] p-5">
            <h2 className="mb-4 text-sm font-semibold text-[#f1f1f1]">
              Update configuration
            </h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <AmiPicker value={amiId} onChange={setAmiId} />
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
                <select
                  value={
                    INSTANCE_TYPE_OPTIONS.some((o) => o.value === instanceType)
                      ? instanceType
                      : ""
                  }
                  onChange={(e) => setInstanceType(e.target.value)}
                  className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 font-mono text-sm text-[#e8e8e8] outline-none focus:border-[#3b82f6]"
                >
                  <option value="" disabled>
                    {instanceType && !INSTANCE_TYPE_OPTIONS.some((o) => o.value === instanceType)
                      ? `${instanceType} (not one of the allowed types)`
                      : "Select an instance type"}
                  </option>
                  {INSTANCE_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-[#707070]">
                  Limited to these two GPU Spot types. Must match the AMI&apos;s CPU
                  architecture (validated on submit).
                </p>
                {spotPriceLoading ? (
                  <p className="mt-1 text-xs text-[#707070]">
                    Checking Spot price…
                  </p>
                ) : spotPrice?.cheapest ? (
                  <p className="mt-1 text-xs text-[#8fd6a3]">
                    Est. Spot: ${spotPrice.cheapest.pricePerHour.toFixed(4)}/hr in{" "}
                    {spotPrice.cheapest.az}
                    {spotPrice.prices.length > 1 &&
                      ` (cheapest of ${spotPrice.prices.length} AZs)`}
                  </p>
                ) : spotPrice && spotPrice.prices.length === 0 ? (
                  <p className="mt-1 text-xs text-[#707070]">
                    No recent Spot price history for this type/AZ combination.
                  </p>
                ) : null}
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
                  {spotPrice?.cheapest && (
                    <>
                      {" "}
                      Estimated Spot cost: ~$
                      {spotPrice.cheapest.pricePerHour.toFixed(4)}/hr per instance.
                    </>
                  )}{" "}
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
