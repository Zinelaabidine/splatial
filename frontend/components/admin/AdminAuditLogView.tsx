"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import { useIsAdmin } from "@/lib/auth/useIsAdmin";
import { listAuditLogs } from "@/services/adminUsersService";
import type { AuditLogEntry } from "@/types/adminUsers";

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function AdminAuditLogView() {
  const isAdmin = useIsAdmin();
  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (opts: { cursor?: string; append: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await listAuditLogs({ limit: 50, cursor: opts.cursor });
      setItems((prev) => (opts.append ? [...prev, ...res.items] : res.items));
      setCursor(res.cursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin === true) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      load({ cursor: undefined, append: false });
    }
  }, [isAdmin, load]);

  if (isAdmin !== true) return null;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--nord-ink)]">Audit log</h1>
          <p className="text-sm text-[var(--nord-slate)]">Every sensitive admin user-management action, newest first.</p>
        </div>
        <button
          type="button"
          onClick={() => load({ cursor: undefined, append: false })}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--nord-hairline)] bg-[var(--nord-surface)] px-3 py-2 text-sm text-[var(--nord-ink)] hover:bg-[var(--nord-surface)] disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-[var(--nord-danger)] bg-[var(--nord-danger-tint)] px-4 py-3 text-sm text-[var(--nord-danger)]">{error}</div>
      )}

      {loading && items.length === 0 ? (
        <div className="flex h-64 items-center justify-center text-[var(--nord-slate)]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--nord-hairline)] bg-[var(--nord-bg)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--nord-hairline)] bg-[var(--nord-surface)] text-left text-xs font-semibold uppercase tracking-wider text-[var(--nord-slate)]">
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Target user</th>
                <th className="px-4 py-3">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--nord-hairline)]">
              {items.map((log) => (
                <tr key={log.logId}>
                  <td className="px-4 py-3 text-[var(--nord-ink)]">{formatWhen(log.createdAt)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-[var(--nord-ink)]">{log.actionType}</td>
                  <td className="px-4 py-3 text-xs text-[var(--nord-slate)]">{log.actorAdminId}</td>
                  <td className="px-4 py-3 text-xs text-[var(--nord-slate)]">{log.targetUserId}</td>
                  <td className="px-4 py-3 text-xs text-[var(--nord-slate)]">{log.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {cursor && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => load({ cursor, append: true })}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--nord-hairline)] bg-[var(--nord-surface)] px-4 py-2 text-sm text-[var(--nord-ink)] hover:bg-[var(--nord-surface)]"
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
