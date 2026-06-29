"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  PlusCircle,
} from "lucide-react";

import SlideOverPanel from "@/components/layout/panels/SlideOverPanel";
import { formatSceneDate } from "@/lib/scenes/sceneMappers";
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

type ActivityPanelProps = {
  open: boolean;
  onClose: () => void;
};

export default function ActivityPanel({ open, onClose }: ActivityPanelProps) {
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
    return scenes
      .flatMap(eventsFromScene)
      .sort((a, b) => b.sortKey - a.sortKey);
  }, [scenes]);

  return (
    <SlideOverPanel open={open} onClose={onClose} title="Activity">
      {error && (
        <div className="mx-4 mt-4 rounded-lg border border-[#5b2626] bg-[#2a1414] px-3 py-2 text-xs text-[#f0a8a8]">
          {error}
        </div>
      )}

      {loading && events.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-[#909090]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading…
        </div>
      ) : events.length === 0 ? (
        <div className="flex h-40 items-center justify-center px-4 text-center text-sm text-[#808080]">
          No recent activity
        </div>
      ) : (
        <ul className="divide-y divide-[#252525]">
          {events.map((event) => {
            const meta = EVENT_META[event.type];
            const Icon = meta.icon;
            return (
              <li
                key={event.id}
                className="flex gap-3 px-4 py-3 transition-colors hover:bg-[#1a1a1a]"
              >
                <Icon
                  className="mt-0.5 h-4 w-4 shrink-0"
                  strokeWidth={1.5}
                  style={{ color: meta.color }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white">{meta.label}</p>
                  <p className="truncate text-xs text-[#b0b0b0]">
                    {event.sceneName}
                  </p>
                  <p className="mt-0.5 font-sw-mono text-[11px] text-[#707070]">
                    {event.timestamp}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SlideOverPanel>
  );
}
