import { useCallback, useRef, useState } from "react";
import { interpolateViewMatrix } from "@/viewer/trajectoryMath";
import { readViewMatrix, setViewMatrix, clearViewMatrix } from "@/viewer/engine/viewer";

export type TrajectoryStatus = "idle" | "recording" | "playing";

export interface Keyframe {
  t: number;        // ms since recording started
  matrix: number[]; // 16-element column-major view matrix snapshot
}

export interface TrajectoryHook {
  status: TrajectoryStatus;
  keyframeCount: number;
  playbackProgress: number; // 0–1
  startRecording: () => void;
  stopRecording: () => void;
  /** Begin playback. Optional `onEnd` fires when the last keyframe is reached. */
  startPlayback: (onEnd?: () => void) => void;
  stopPlayback: () => void;
  clearTrajectory: () => void;
}

/** Sample the camera every 50 ms → 20 keyframes/s. */
const RECORD_INTERVAL_MS = 50;

export function useCameraTrajectory(): TrajectoryHook {
  const [status, setStatus] = useState<TrajectoryStatus>("idle");
  const [keyframeCount, setKeyframeCount] = useState(0);
  const [playbackProgress, setPlaybackProgress] = useState(0);

  const keyframesRef   = useRef<Keyframe[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef         = useRef<number | null>(null);

  // ── recording ──────────────────────────────────────────────────────────────

  const stopRecording = useCallback(() => {
    if (recordTimerRef.current !== null) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    setStatus("idle");
  }, []);

  const startRecording = useCallback(() => {
    // Cancel any running playback first
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    clearViewMatrix();

    keyframesRef.current = [];
    setKeyframeCount(0);
    setPlaybackProgress(0);
    setStatus("recording");

    const startT = Date.now();
    recordTimerRef.current = setInterval(() => {
      const matrix = readViewMatrix();
      if (!matrix) return;
      keyframesRef.current.push({ t: Date.now() - startT, matrix });
      setKeyframeCount(keyframesRef.current.length);
    }, RECORD_INTERVAL_MS);
  }, []);

  // ── playback ───────────────────────────────────────────────────────────────

  const stopPlayback = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    clearViewMatrix();
    setPlaybackProgress(0);
    setStatus("idle");
  }, []);

  const startPlayback = useCallback((onEnd?: () => void) => {
    const kfs = keyframesRef.current;
    if (kfs.length < 2) return;

    // Stop recording if somehow still active
    if (recordTimerRef.current !== null) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }

    setStatus("playing");
    setPlaybackProgress(0);

    const totalDuration = kfs[kfs.length - 1].t;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;

      if (elapsed >= totalDuration) {
        clearViewMatrix();
        setPlaybackProgress(1);
        setStatus("idle");
        onEnd?.();
        return;
      }

      // Find the pair of keyframes that bracket `elapsed`
      let lo = 0;
      for (let i = 0; i < kfs.length - 1; i++) {
        if (kfs[i + 1].t >= elapsed) { lo = i; break; }
      }

      const kf0 = kfs[lo];
      const kf1 = kfs[lo + 1] ?? kfs[lo];
      const span = kf1.t - kf0.t;
      const localT = span > 0 ? Math.min(1, (elapsed - kf0.t) / span) : 0;

      const interp = interpolateViewMatrix(kf0.matrix, kf1.matrix, localT);
      if (interp) setViewMatrix(interp);

      setPlaybackProgress(elapsed / totalDuration);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // ── clear ──────────────────────────────────────────────────────────────────

  const clearTrajectory = useCallback(() => {
    if (recordTimerRef.current !== null) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    clearViewMatrix();
    keyframesRef.current = [];
    setKeyframeCount(0);
    setPlaybackProgress(0);
    setStatus("idle");
  }, []);

  return {
    status,
    keyframeCount,
    playbackProgress,
    startRecording,
    stopRecording,
    startPlayback,
    stopPlayback,
    clearTrajectory,
  };
}
