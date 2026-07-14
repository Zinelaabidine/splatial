"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, RefreshCw } from "lucide-react";

import { getAttemptLogs } from "@/services/adminLogsService";
import type { AttemptLogLine } from "@/types/adminLogs";
import type { AdminAttempt } from "@/types/admin";

const HOUR = 3_600_000;
const FETCH_LIMIT = 200;

const LEVEL_STYLES: Record<string, string> = {
  error: "text-[var(--nord-danger)]",
  warning: "text-[#9a6b1f]",
  info: "text-[var(--nord-slate)]",
  debug: "text-[var(--nord-slate-soft)]",
};

const LEVEL_FILTERS = [
  { value: "", label: "All levels" },
  { value: "info", label: "Info" },
  { value: "warning", label: "Warning" },
  { value: "error", label: "Error" },
];

/** Bound the CloudWatch query to the attempt's lifetime (cheap + precise). */
function windowFor(attempt: AdminAttempt): { from: number; to: number } {
  const now = Date.now();
  const created = attempt.createdAt ? Date.parse(attempt.createdAt) : NaN;
  const updated = attempt.updatedAt ? Date.parse(attempt.updatedAt) : NaN;
  const from = Number.isNaN(created) ? now - 14 * 24 * HOUR : created - HOUR;
  const to = Number.isNaN(updated) ? now : updated + HOUR;
  return { from, to };
}

function formatTime(line: AttemptLogLine): string {
  const d = new Date(line.ts ?? line.timestamp);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour12: false }) +
    "." + String(d.getMilliseconds()).padStart(3, "0");
}

function hasData(data: AttemptLogLine["data"]): boolean {
  return !!data && Object.keys(data).length > 0;
}

function LogRow({ line }: { line: AttemptLogLine }) {
  const [open, setOpen] = useState(false);
  const level = (line.level ?? "info").toLowerCase();
  const expandable = hasData(line.data);
  const label = line.event ?? line.msg ?? line.raw ?? "";

  return (
    <div className="border-b border-[var(--nord-hairline)] last:border-b-0">
      <button
        type="button"
        onClick={() => expandable && setOpen((o) => !o)}
        className={`flex w-full items-start gap-3 px-3 py-1.5 text-left font-mono text-xs leading-relaxed ${
          expandable ? "cursor-pointer hover:bg-[var(--nord-surface)]" : "cursor-default"
        }`}
      >
        <span className="w-4 shrink-0 pt-0.5 text-[var(--nord-slate-soft)]">
          {expandable ? (
            open ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )
          ) : null}
        </span>
        <span className="w-24 shrink-0 tabular-nums text-[var(--nord-slate-soft)]">
          {formatTime(line)}
        </span>
        <span
          className={`w-16 shrink-0 uppercase ${LEVEL_STYLES[level] ?? "text-[var(--nord-slate)]"}`}
        >
          {level}
        </span>
        {line.event && (
          <span className="shrink-0 rounded bg-[var(--nord-surface)] px-1.5 py-px text-[#7fb0e8]">
            {line.event}
          </span>
        )}
        <span className="min-w-0 flex-1 break-words text-[var(--nord-ink)]">
          {line.event ? line.msg ?? "" : label}
        </span>
      </button>
      {open && expandable && (
        <pre className="overflow-x-auto bg-[var(--nord-bg)] px-12 py-2 font-mono text-[11px] text-[var(--nord-slate)]">
          {JSON.stringify(line.data, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default function AttemptLogPanel({ attempt }: { attempt: AdminAttempt }) {
  const [lines, setLines] = useState<AttemptLogLine[]>([]);
  const [nextToken, setNextToken] = useState<string | undefined>(undefined);
  const [level, setLevel] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (opts: { level: string; nextToken?: string; append: boolean }) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      if (opts.append) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      const { from, to } = windowFor(attempt);
      try {
        const res = await getAttemptLogs(attempt.attemptId, {
          from,
          to,
          level: opts.level || undefined,
          limit: FETCH_LIMIT,
          nextToken: opts.nextToken,
          signal: controller.signal,
        });
        setLines((prev) => (opts.append ? [...prev, ...res.lines] : res.lines));
        setNextToken(res.nextToken);
      } catch (e) {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Failed to load logs");
      } finally {
        if (opts.append) setLoadingMore(false);
        else setLoading(false);
      }
    },
    [attempt],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load({ level, nextToken: undefined, append: false });
    }, 0);
    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [level, load]);

  return (
    <div className="rounded-lg border border-[var(--nord-hairline)] bg-[var(--nord-bg)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--nord-hairline)] px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--nord-slate)]">
          Worker logs
        </span>
        <div className="flex items-center gap-2">
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="rounded-md border border-[var(--nord-hairline)] bg-[var(--nord-surface)] px-2 py-1 text-xs text-[var(--nord-ink)] outline-none focus:border-[#3b82f6]"
          >
            {LEVEL_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => load({ level, nextToken: undefined, append: false })}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--nord-hairline)] bg-[var(--nord-surface)] px-2 py-1 text-xs text-[var(--nord-ink)] transition-colors hover:bg-[var(--nord-surface)] disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="px-3 py-4 text-xs text-[var(--nord-danger)]">{error}</div>
      ) : loading ? (
        <div className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-[var(--nord-slate)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading logs…
        </div>
      ) : lines.length === 0 ? (
        <div className="px-3 py-6 text-center text-xs text-[var(--nord-slate)]">
          No log lines found for this attempt in the retained window.
        </div>
      ) : (
        <>
          <div className="max-h-96 overflow-y-auto">
            {lines.map((line, i) => (
              <LogRow key={`${line.timestamp}-${i}`} line={line} />
            ))}
          </div>
          {nextToken && (
            <div className="border-t border-[var(--nord-hairline)] px-3 py-2 text-center">
              <button
                type="button"
                onClick={() => load({ level, nextToken, append: true })}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 rounded-md border border-[var(--nord-hairline)] bg-[var(--nord-surface)] px-3 py-1 text-xs text-[var(--nord-ink)] transition-colors hover:bg-[var(--nord-surface)] disabled:opacity-50"
              >
                {loadingMore && <Loader2 className="h-3 w-3 animate-spin" />}
                Load more
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
