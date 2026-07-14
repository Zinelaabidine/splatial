"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Rocket, ShieldAlert } from "lucide-react";

import { useIsAdmin } from "@/lib/auth/useIsAdmin";
import {
  activateWorkerAmi,
  bootWorkerAmi,
  listWorkerAmis,
  registerWorkerAmi,
} from "@/services/adminService";
import type { WorkerAmi } from "@/types/admin";

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

function shortId(id: string | null, head = 10): string {
  if (!id) return "—";
  return id.length > head + 2 ? `${id.slice(0, head)}…` : id;
}

export default function WorkerAmiPanel() {
  const isAdmin = useIsAdmin();

  const [amis, setAmis] = useState<WorkerAmi[]>([]);
  const [currentAmiId, setCurrentAmiId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedAmiId, setSelectedAmiId] = useState<string>("");

  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [regAmiId, setRegAmiId] = useState("");
  const [regLabel, setRegLabel] = useState("");
  const [regBaseAmiId, setRegBaseAmiId] = useState("");
  const [regReason, setRegReason] = useState("");

  const [booting, setBooting] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootedInstanceId, setBootedInstanceId] = useState<string | null>(null);

  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);
  const [activateNote, setActivateNote] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError(null);
    try {
      const res = await listWorkerAmis(ctrl.signal);
      if (ctrl.signal.aborted) return;
      setAmis(res.items);
      setCurrentAmiId(res.currentAmiId);
      setSelectedAmiId((prev) => prev || res.currentAmiId || res.items[0]?.amiId || "");
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setError(e instanceof Error ? e.message : "Failed to load worker AMIs");
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin === true) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void load();
    }
    return () => abortRef.current?.abort();
  }, [isAdmin, load]);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setRegistering(true);
    setRegisterError(null);
    try {
      await registerWorkerAmi({
        amiId: regAmiId.trim(),
        label: regLabel.trim(),
        ...(regBaseAmiId.trim() ? { baseAmiId: regBaseAmiId.trim() } : {}),
        ...(regReason.trim() ? { reason: regReason.trim() } : {}),
      });
      setRegAmiId("");
      setRegLabel("");
      setRegBaseAmiId("");
      setRegReason("");
      await load();
    } catch (e) {
      setRegisterError(e instanceof Error ? e.message : "Failed to register AMI");
    } finally {
      setRegistering(false);
    }
  }

  async function handleBoot() {
    if (!selectedAmiId) return;
    setBooting(true);
    setBootError(null);
    setBootedInstanceId(null);
    try {
      const res = await bootWorkerAmi(selectedAmiId);
      setBootedInstanceId(res.instanceId);
      await load();
    } catch (e) {
      setBootError(e instanceof Error ? e.message : "Failed to boot instance");
    } finally {
      setBooting(false);
    }
  }

  async function handleActivate() {
    if (!selectedAmiId) return;
    setActivating(true);
    setActivateError(null);
    setActivateNote(null);
    try {
      const res = await activateWorkerAmi(selectedAmiId);
      setActivateNote(res.note);
      await load();
    } catch (e) {
      setActivateError(e instanceof Error ? e.message : "Failed to update configuration");
    } finally {
      setActivating(false);
    }
  }

  if (isAdmin === null) {
    return (
      <div className="flex h-64 items-center justify-center text-[var(--nord-slate)]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Checking access…
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="mx-auto mt-16 flex max-w-md flex-col items-center rounded-xl border border-[var(--nord-hairline)] bg-[var(--nord-bg)] px-6 py-10 text-center">
        <ShieldAlert className="mb-3 h-8 w-8 text-[var(--nord-danger)]" />
        <h2 className="text-lg font-semibold text-[var(--nord-ink)]">Admin access required</h2>
        <p className="mt-1 text-sm text-[var(--nord-slate)]">
          Your account isn’t in the admin group. Ask an operator to add you, then sign out and back in.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--nord-ink)]">Worker AMIs</h1>
        <p className="text-sm text-[var(--nord-slate)]">
          AMIs baked by the bake-worker-ami GitHub Action. Register one here, smoke-test it with Manual worker
          boot, then mark it Current in the registry. Deploying it for real still means editing{" "}
          <code className="rounded bg-[var(--nord-surface)] px-1 py-0.5 text-xs">locals.worker_ami_id</code> in{" "}
          <code className="rounded bg-[var(--nord-surface)] px-1 py-0.5 text-xs">compute.tf</code> and running{" "}
          <code className="rounded bg-[var(--nord-surface)] px-1 py-0.5 text-xs">terraform apply</code>.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-[var(--nord-danger)] bg-[var(--nord-danger-tint)] px-4 py-3 text-sm text-[var(--nord-danger)]">
          {error}
        </div>
      )}

      {/* Registered AMIs */}
      <section className="rounded-xl border border-[var(--nord-hairline)]">
        <div className="flex items-center justify-between border-b border-[var(--nord-hairline)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--nord-ink)]">Registered AMIs</h2>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg border border-[var(--nord-hairline)] bg-[var(--nord-surface)] px-3 py-1.5 text-xs text-[var(--nord-ink)] hover:bg-[var(--nord-surface)] disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        {loading && amis.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-[var(--nord-slate)]">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading…
          </div>
        ) : amis.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-[var(--nord-slate)]">
            No AMIs registered yet.
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-[var(--nord-slate)]">
                <th className="px-4 py-2 font-medium">AMI</th>
                <th className="px-4 py-2 font-medium">Label</th>
                <th className="px-4 py-2 font-medium">Arch</th>
                <th className="px-4 py-2 font-medium">Registered</th>
                <th className="px-4 py-2 font-medium">Last boot</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {amis.map((ami) => (
                <tr key={ami.amiId} className="border-t border-[var(--nord-hairline)]">
                  <td className="px-4 py-2 font-mono text-xs text-[var(--nord-ink)]">{ami.amiId}</td>
                  <td className="px-4 py-2 text-[var(--nord-ink)]">{ami.label}</td>
                  <td className="px-4 py-2 text-[var(--nord-slate)]">{ami.architecture ?? "—"}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-[var(--nord-slate)]">
                    {formatWhen(ami.registeredAt)}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-[var(--nord-slate)]">
                    {shortId(ami.lastBootInstanceId, 12)}
                  </td>
                  <td className="px-4 py-2">
                    {ami.amiId === currentAmiId && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-[var(--nord-success-tint)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--nord-success)]">
                        <CheckCircle2 className="h-3 w-3" />
                        Current
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Register a new AMI */}
        <section className="rounded-xl border border-[var(--nord-hairline)] p-4">
          <h2 className="mb-3 text-sm font-semibold text-[var(--nord-ink)]">Register a new AMI</h2>
          <form onSubmit={handleRegister} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-[var(--nord-slate)]">AMI ID</label>
              <input
                required
                value={regAmiId}
                onChange={(e) => setRegAmiId(e.target.value)}
                placeholder="ami-0123456789abcdef0"
                className="w-full rounded-lg border border-[var(--nord-hairline)] bg-[var(--nord-surface)] px-3 py-2 text-sm text-[var(--nord-ink)] outline-none focus:border-[#3b82f6]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-[var(--nord-slate)]">Label</label>
              <input
                required
                value={regLabel}
                onChange={(e) => setRegLabel(e.target.value)}
                placeholder="fix-colmap-timeout"
                className="w-full rounded-lg border border-[var(--nord-hairline)] bg-[var(--nord-surface)] px-3 py-2 text-sm text-[var(--nord-ink)] outline-none focus:border-[#3b82f6]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-[var(--nord-slate)]">
                Base AMI (optional)
              </label>
              <input
                value={regBaseAmiId}
                onChange={(e) => setRegBaseAmiId(e.target.value)}
                placeholder="ami-0a6913682d6d953eb"
                className="w-full rounded-lg border border-[var(--nord-hairline)] bg-[var(--nord-surface)] px-3 py-2 text-sm text-[var(--nord-ink)] outline-none focus:border-[#3b82f6]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-[var(--nord-slate)]">
                Reason (optional)
              </label>
              <input
                value={regReason}
                onChange={(e) => setRegReason(e.target.value)}
                placeholder="Why this bake happened"
                className="w-full rounded-lg border border-[var(--nord-hairline)] bg-[var(--nord-surface)] px-3 py-2 text-sm text-[var(--nord-ink)] outline-none focus:border-[#3b82f6]"
              />
            </div>
            {registerError && <p className="text-xs text-[var(--nord-danger)]">{registerError}</p>}
            <button
              type="submit"
              disabled={registering}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--nord-hairline)] bg-[var(--nord-surface)] px-4 py-2 text-sm text-[var(--nord-ink)] hover:bg-[var(--nord-surface)] disabled:opacity-50"
            >
              {registering && <Loader2 className="h-4 w-4 animate-spin" />}
              Register
            </button>
          </form>
        </section>

        {/* Manual worker boot + Update configuration */}
        <div className="space-y-6">
          <section className="rounded-xl border border-[var(--nord-hairline)] p-4">
            <h2 className="mb-1 text-sm font-semibold text-[var(--nord-ink)]">Manual worker boot</h2>
            <p className="mb-3 text-xs text-[var(--nord-slate)]">
              Launches one standalone EC2 instance from the selected AMI to smoke-test a real job. Does not
              touch the ASG.
            </p>
            <AmiSelect amis={amis} value={selectedAmiId} onChange={setSelectedAmiId} />
            {bootError && <p className="mt-2 text-xs text-[var(--nord-danger)]">{bootError}</p>}
            {bootedInstanceId && (
              <p className="mt-2 font-mono text-xs text-[var(--nord-success)]">
                Launched {bootedInstanceId} — watch it in CloudWatch / the attempts view.
              </p>
            )}
            <button
              type="button"
              onClick={() => void handleBoot()}
              disabled={booting || !selectedAmiId}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[var(--nord-hairline)] bg-[var(--nord-surface)] px-4 py-2 text-sm text-[var(--nord-ink)] hover:bg-[var(--nord-surface)] disabled:opacity-50"
            >
              {booting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              {booting ? "Booting…" : "Boot instance"}
            </button>
          </section>

          <section className="rounded-xl border border-[var(--nord-hairline)] p-4">
            <h2 className="mb-1 text-sm font-semibold text-[var(--nord-ink)]">Update configuration</h2>
            <p className="mb-3 text-xs text-[var(--nord-slate)]">
              Marks the selected AMI as Current in this registry (for the UI and as the Manual worker boot
              default). It does not deploy anything — the live ASG still runs whatever is committed in
              compute.tf.
            </p>
            <AmiSelect amis={amis} value={selectedAmiId} onChange={setSelectedAmiId} />
            {activateError && <p className="mt-2 text-xs text-[var(--nord-danger)]">{activateError}</p>}
            {activateNote && <p className="mt-2 text-xs text-[var(--nord-slate)]">{activateNote}</p>}
            <button
              type="button"
              onClick={() => void handleActivate()}
              disabled={activating || !selectedAmiId}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[var(--nord-hairline)] bg-[var(--nord-surface)] px-4 py-2 text-sm text-[var(--nord-ink)] hover:bg-[var(--nord-surface)] disabled:opacity-50"
            >
              {activating && <Loader2 className="h-4 w-4 animate-spin" />}
              Set as current
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

function AmiSelect({
  amis,
  value,
  onChange,
}: {
  amis: WorkerAmi[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-[var(--nord-hairline)] bg-[var(--nord-surface)] px-3 py-2 text-sm text-[var(--nord-ink)] outline-none focus:border-[#3b82f6]"
    >
      <option value="" disabled>
        Select an AMI…
      </option>
      {amis.map((ami) => (
        <option key={ami.amiId} value={ami.amiId}>
          {ami.label} · {ami.amiId}
        </option>
      ))}
    </select>
  );
}
