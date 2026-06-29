import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
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
  /** Begin playback of the recorded trajectory. Optional `onEnd` fires when done. */
  startPlayback: (onEnd?: () => void) => void;
  /** Play an arbitrary keyframe list (e.g. from a guided tour). */
  playKeyframes: (keyframes: Keyframe[], onEnd?: () => void) => void;
  stopPlayback: () => void;
  clearTrajectory: () => void;
}

/** Sample the camera every 50 ms → 20 keyframes/s. */
const RECORD_INTERVAL_MS = 50;

type PlaybackRefs = {
  rafRef: MutableRefObject<number | null>;
  recordTimerRef: MutableRefObject<ReturnType<typeof setInterval> | null>;
};

type PlaybackSetters = {
  setStatus: (s: TrajectoryStatus) => void;
  setPlaybackProgress: (n: number) => void;
};

function cancelRecording(refs: PlaybackRefs) {
  if (refs.recordTimerRef.current !== null) {
    clearInterval(refs.recordTimerRef.current);
    refs.recordTimerRef.current = null;
  }
}

function cancelRaf(refs: PlaybackRefs) {
  if (refs.rafRef.current !== null) {
    cancelAnimationFrame(refs.rafRef.current);
    refs.rafRef.current = null;
  }
}

function runPlaybackLoop(
  kfs: Keyframe[],
  refs: PlaybackRefs,
  setters: PlaybackSetters,
  onEnd?: () => void,
) {
  if (kfs.length < 2) return;

  cancelRecording(refs);
  setters.setStatus("playing");
  setters.setPlaybackProgress(0);

  const totalDuration = kfs[kfs.length - 1].t;
  const startTime = performance.now();

  const tick = (now: number) => {
    const elapsed = now - startTime;

    if (elapsed >= totalDuration) {
      refs.rafRef.current = null;
      clearViewMatrix();
      setters.setPlaybackProgress(1);
      setters.setStatus("idle");
      onEnd?.();
      return;
    }

    let lo = 0;
    for (let i = 0; i < kfs.length - 1; i++) {
      if (kfs[i + 1].t >= elapsed) {
        lo = i;
        break;
      }
    }

    const kf0 = kfs[lo];
    const kf1 = kfs[lo + 1] ?? kfs[lo];
    const span = kf1.t - kf0.t;
    const localT = span > 0 ? Math.min(1, (elapsed - kf0.t) / span) : 0;

    const interp = interpolateViewMatrix(kf0.matrix, kf1.matrix, localT);
    if (interp) setViewMatrix(interp);

    setters.setPlaybackProgress(elapsed / totalDuration);
    refs.rafRef.current = requestAnimationFrame(tick);
  };

  refs.rafRef.current = requestAnimationFrame(tick);
}

export function useCameraTrajectory(): TrajectoryHook {
  const [status, setStatus] = useState<TrajectoryStatus>("idle");
  const [keyframeCount, setKeyframeCount] = useState(0);
  const [playbackProgress, setPlaybackProgress] = useState(0);

  const keyframesRef = useRef<Keyframe[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = useRef<number | null>(null);

  const refs: PlaybackRefs = { rafRef, recordTimerRef };
  const setters: PlaybackSetters = { setStatus, setPlaybackProgress };

  const stopRecording = useCallback(() => {
    cancelRecording(refs);
    setStatus("idle");
  }, []);

  const startRecording = useCallback(() => {
    cancelRaf(refs);
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

  const stopPlayback = useCallback(() => {
    cancelRaf(refs);
    clearViewMatrix();
    setPlaybackProgress(0);
    setStatus("idle");
  }, []);

  const playKeyframes = useCallback((keyframes: Keyframe[], onEnd?: () => void) => {
    if (keyframes.length < 2) return;
    cancelRaf(refs);
    runPlaybackLoop(keyframes, refs, setters, onEnd);
  }, []);

  const startPlayback = useCallback(
    (onEnd?: () => void) => {
      playKeyframes(keyframesRef.current, onEnd);
    },
    [playKeyframes],
  );

  const clearTrajectory = useCallback(() => {
    cancelRecording(refs);
    cancelRaf(refs);
    clearViewMatrix();
    keyframesRef.current = [];
    setKeyframeCount(0);
    setPlaybackProgress(0);
    setStatus("idle");
  }, []);

  useEffect(() => {
    return () => {
      cancelRecording(refs);
      cancelRaf(refs);
      clearViewMatrix();
    };
  }, []);

  return {
    status,
    keyframeCount,
    playbackProgress,
    startRecording,
    stopRecording,
    startPlayback,
    playKeyframes,
    stopPlayback,
    clearTrajectory,
  };
}
