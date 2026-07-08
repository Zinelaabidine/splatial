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
          <h1 className="text-xl font-semibold text-[#f1f1f1]">Audit log</h1>
          <p className="text-sm text-[#909090]">Every sensitive admin user-management action, newest first.</p>
        </div>
        <button
          type="button"
          onClick={() => load({ cursor: undefined, append: false })}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-[#e8e8e8] hover:bg-[#222] disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-[#5b2626] bg-[#2a1414] px-4 py-3 text-sm text-[#f0a8a8]">{error}</div>
      )}

      {loading && items.length === 0 ? (
        <div className="flex h-64 items-center justify-center text-[#909090]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#161616]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2a2a2a] bg-[#1a1a1a] text-left text-xs font-semibold uppercase tracking-wider text-[#808080]">
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Target user</th>
                <th className="px-4 py-3">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#232323]">
              {items.map((log) => (
                <tr key={log.logId}>
                  <td className="px-4 py-3 text-[#c8c8c8]">{formatWhen(log.createdAt)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-[#e8e8e8]">{log.actionType}</td>
                  <td className="px-4 py-3 text-xs text-[#a0a0a0]">{log.actorAdminId}</td>
                  <td className="px-4 py-3 text-xs text-[#a0a0a0]">{log.targetUserId}</td>
                  <td className="px-4 py-3 text-xs text-[#a0a0a0]">{log.reason ?? "—"}</td>
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
            className="inline-flex items-center gap-2 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-2 text-sm text-[#e8e8e8] hover:bg-[#222]"
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
