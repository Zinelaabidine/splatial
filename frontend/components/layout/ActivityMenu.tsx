"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  PlusCircle,
} from "lucide-react";

import { useDismissablePopover } from "@/hooks/layout/useDismissablePopover";
import { formatSceneDate } from "@/lib/scenes/sceneMappers";
import { cn } from "@/lib/utils";
import { listScenes } from "@/services/scenesService";
import type { Scene, SceneManagementStatus } from "@/types/api";

type ActivityEventType =
  | "created"
  | "training_started"
  | "training_completed"
  | "training_failed";

type ActivityEvent = {
  id: string;
  type: ActivityEventType;
  sceneName: string;
  timestamp: string;
  sortKey: number;
};

const EVENT_META: Record<
  ActivityEventType,
  { label: string; icon: typeof PlusCircle; color: string }
> = {
  created: { label: "Scene created", icon: PlusCircle, color: "#909090" },
  training_started: { label: "Training started", icon: Clock, color: "#60a5fa" },
  training_completed: {
    label: "Training completed",
    icon: CheckCircle,
    color: "#4ade80",
  },
  training_failed: {
    label: "Training failed",
    icon: AlertCircle,
    color: "#f87171",
  },
};

function eventsFromScene(scene: Scene): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  const sortKey = Date.parse(scene.createdAt) || 0;
  const base = {
    sceneName: scene.name,
    timestamp: formatSceneDate(scene.createdAt),
    sortKey,
  };

  events.push({
    id: `${scene.sceneId}-created`,
    type: "created",
    ...base,
  });

  switch (scene.status as SceneManagementStatus) {
    case "QUEUED":
    case "PROCESSING":
      events.push({
        id: `${scene.sceneId}-training`,
        type: "training_started",
        ...base,
      });
      break;
    case "READY":
      events.push({
        id: `${scene.sceneId}-completed`,
        type: "training_completed",
        ...base,
      });
      break;
    case "FAILED":
      events.push({
        id: `${scene.sceneId}-failed`,
        type: "training_failed",
        ...base,
      });
      break;
    default:
      break;
  }

  return events;
}

// Facebook-style anchored popover — trigger lives in the top bar next to
// training/notifications/account, replacing the old sidebar drawer entry
// point.
export default function ActivityMenu() {
  const { open, setOpen, ref } = useDismissablePopover<HTMLDivElement>();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError(null);

    try {
      const data = await listScenes(ctrl.signal);
      if (!ctrl.signal.aborted) setScenes(data.scenes ?? []);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setError(e instanceof Error ? e.message : "Failed to load activity");
      setScenes([]);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => abortRef.current?.abort();
  }, [open, load]);

  const events = useMemo(() => {
    return scenes.flatMap(eventsFromScene).sort((a, b) => b.sortKey - a.sortKey);
  }, [scenes]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label="Activity"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors",
          open ? "bg-[var(--nord-tint)] text-[var(--nord-ink)]" : "text-[var(--nord-ink)] hover:bg-[var(--nord-tint)]",
        )}
      >
        <Clock className="h-5 w-5" strokeWidth={open ? 2 : 1.5} />
      </button>

      {open && (
        <div
          aria-label="Activity"
          className="sw-popover absolute right-0 top-full z-50 mt-2 w-96 overflow-hidden rounded-xl"
        >
          <div className="border-b border-[var(--nord-hairline)] px-4 py-3">
            <h3 className="text-sm font-semibold text-[var(--nord-ink)]">Activity</h3>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {error && (
              <div className="mx-4 mt-3 rounded-lg border border-[var(--nord-danger)] bg-[var(--nord-danger-tint)] px-3 py-2 text-xs text-[var(--nord-danger)]">
                {error}
              </div>
            )}

            {loading && events.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-[var(--nord-slate)]">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading…
              </div>
            ) : events.length === 0 ? (
              <div className="flex h-32 items-center justify-center px-4 text-center text-sm text-[var(--nord-slate)]">
                No recent activity
              </div>
            ) : (
              <ul className="divide-y divide-[var(--nord-hairline)]">
                {events.map((event) => {
                  const meta = EVENT_META[event.type];
                  const Icon = meta.icon;
                  return (
                    <li
                      key={event.id}
                      className="flex gap-3 px-4 py-3 transition-colors hover:bg-[var(--nord-tint)]"
                    >
                      <Icon
                        className="mt-0.5 h-4 w-4 shrink-0"
                        strokeWidth={1.5}
                        style={{ color: meta.color }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-[var(--nord-ink)]">{meta.label}</p>
                        <p className="truncate text-xs text-[var(--nord-slate)]">{event.sceneName}</p>
                        <p className="mt-0.5 font-sw-mono text-[11px] text-[var(--nord-slate-soft)]">
                          {event.timestamp}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
