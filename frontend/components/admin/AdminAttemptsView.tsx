"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, ShieldAlert } from "lucide-react";

import AdminAttemptsTable from "@/components/admin/AdminAttemptsTable";
import { useIsAdmin } from "@/lib/auth/useIsAdmin";
import { listAdminAttempts } from "@/services/adminService";
import type { AdminAttempt } from "@/types/admin";

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "QUEUED", label: "Queued" },
  { value: "PROCESSING", label: "Processing" },
  { value: "READY", label: "Ready" },
  { value: "FAILED", label: "Failed" },
  { value: "CANCELLED", label: "Cancelled" },
];

const PAGE_SIZE = 25;

export default function AdminAttemptsView() {
  const isAdmin = useIsAdmin();

  const [attempts, setAttempts] = useState<AdminAttempt[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (opts: { status: string; cursor?: string; append: boolean }) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (opts.append) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      try {
        const res = await listAdminAttempts({
          status: opts.status || undefined,
          limit: PAGE_SIZE,
          cursor: opts.cursor,
          signal: controller.signal,
        });
        setAttempts((prev) =>
          opts.append ? [...prev, ...res.items] : res.items,
        );
        setCursor(res.cursor);
      } catch (e) {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Failed to load attempts");
      } finally {
        if (opts.append) setLoadingMore(false);
        else setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (isAdmin === true) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      load({ status, cursor: undefined, append: false });
    }
    return () => abortRef.current?.abort();
  }, [isAdmin, status, load]);

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
        <h2 className="text-lg font-semibold text-[#f1f1f1]">
          Admin access required
        </h2>
        <p className="mt-1 text-sm text-[#909090]">
          Your account isn’t in the admin group. Ask an operator to add you, then
          sign out and back in.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#f1f1f1]">
            Attempts overview
          </h1>
          <p className="text-sm text-[#909090]">
            Every training run across all users. Click a row for details.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-[#e8e8e8] outline-none focus:border-[#3b82f6]"
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => load({ status, cursor: undefined, append: false })}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-[#e8e8e8] transition-colors hover:bg-[#222] disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-[#5b2626] bg-[#2a1414] px-4 py-3 text-sm text-[#f0a8a8]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center text-[#909090]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading attempts…
        </div>
      ) : attempts.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-[#2a2a2a] text-[#808080]">
          No attempts found.
        </div>
      ) : (
        <>
          <AdminAttemptsTable attempts={attempts} />
          {cursor && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => load({ status, cursor, append: true })}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-2 text-sm text-[#e8e8e8] transition-colors hover:bg-[#222] disabled:opacity-50"
              >
                {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
                Load more
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
