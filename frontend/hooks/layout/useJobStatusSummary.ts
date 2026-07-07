"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { isTransientNetworkError } from "@/lib/api/apiErrors";
import { listScenes } from "@/services/scenesService";
import type { Scene } from "@/types/api";

const POLL_MS = 15_000;
const RETRY_MS = 1_500;

export type JobStatusJob = {
  sceneId: string;
  name: string;
  status: Scene["status"];
  progressPercent?: number;
  progressPhase?: string;
  progressSubPhase?: string;
  progressEtaSeconds?: number;
  createdAt: string;
  updatedAt: string;
  failureReason?: string;
  errorMessage?: string;
};

export type JobStatusSummary = {
  queuedCount: number;
  processingCount: number;
  failedCount: number;
  /** QUEUED / PROCESSING / FAILED jobs only, newest first — READY and CANCELLED are noise here. */
  jobs: JobStatusJob[];
};

const EMPTY_SUMMARY: JobStatusSummary = {
  queuedCount: 0,
  processingCount: 0,
  failedCount: 0,
  jobs: [],
};

function toSummary(scenes: Scene[]): JobStatusSummary {
  const jobs: JobStatusJob[] = scenes
    .filter((s) => s.status === "QUEUED" || s.status === "PROCESSING" || s.status === "FAILED")
    .map((s) => ({
      sceneId: s.sceneId,
      name: s.name,
      status: s.status,
      progressPercent: s.progressPercent,
      progressPhase: s.progressPhase,
      progressSubPhase: s.progressSubPhase,
      progressEtaSeconds: s.progressEtaSeconds,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt ?? s.createdAt,
      failureReason: s.failureReason,
      errorMessage: s.errorMessage,
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return {
    queuedCount: jobs.filter((j) => j.status === "QUEUED").length,
    processingCount: jobs.filter((j) => j.status === "PROCESSING").length,
    failedCount: jobs.filter((j) => j.status === "FAILED").length,
    jobs,
  };
}

/**
 * Polls the caller's scenes and derives a queue/processing/failed summary for
 * the top-bar job status indicator. Self-service (GET /api/v1/scenes) rather
 * than the admin attempts endpoint, so it works for every signed-in user.
 */
export function useJobStatusSummary(): JobStatusSummary {
  const [summary, setSummary] = useState<JobStatusSummary>(EMPTY_SUMMARY);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const data = await listScenes(ctrl.signal);
      if (!ctrl.signal.aborted) setSummary(toSummary(data.scenes ?? []));
    } catch (err) {
      if (ctrl.signal.aborted) return;
      if (isTransientNetworkError(err)) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
        if (ctrl.signal.aborted) return;
        try {
          const data = await listScenes(ctrl.signal);
          if (!ctrl.signal.aborted) setSummary(toSummary(data.scenes ?? []));
          return;
        } catch {
          /* fall through */
        }
      }
      setSummary(EMPTY_SUMMARY);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => {
      clearInterval(timer);
      abortRef.current?.abort();
    };
  }, [refresh]);

  return summary;
}
