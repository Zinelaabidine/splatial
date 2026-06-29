"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { isActiveGpuJobStatus } from "@/lib/scenes/sceneMappers";
import { isTransientNetworkError } from "@/lib/api/apiErrors";
import { listScenes } from "@/services/scenesService";

const POLL_MS = 15_000;
const RETRY_MS = 1_500;

export function useTrainingCount(): number {
  const [count, setCount] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const data = await listScenes(ctrl.signal);
      const active = (data.scenes ?? []).filter((s) =>
        isActiveGpuJobStatus(s.status),
      ).length;
      if (!ctrl.signal.aborted) setCount(active);
    } catch (err) {
      if (ctrl.signal.aborted) return;
      if (isTransientNetworkError(err)) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
        if (ctrl.signal.aborted) return;
        try {
          const data = await listScenes(ctrl.signal);
          const active = (data.scenes ?? []).filter((s) =>
            isActiveGpuJobStatus(s.status),
          ).length;
          if (!ctrl.signal.aborted) setCount(active);
          return;
        } catch {
          /* fall through */
        }
      }
      setCount(0);
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

  return count;
}
