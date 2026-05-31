"use client";

import { useCallback } from "react";
import { useCameraTrajectory } from "./useCameraTrajectory";
import { useMp4Export } from "./useMp4Export";

/**
 * Floating overlay that provides camera trajectory recording / playback and
 * MP4/WebM export.  Rendered inside .splat-viewer-container so it sits on top
 * of the WebGL canvas.
 */
export default function TrajectoryControls() {
  const traj = useCameraTrajectory();
  const mp4  = useMp4Export();

  /**
   * Export: starts video recording then kicks off a full trajectory playback.
   * When playback ends the recorder is stopped and the file is downloaded.
   */
  const exportVideo = useCallback(() => {
    if (traj.keyframeCount < 2) return;
    mp4.startVideoRecording(30);
    traj.startPlayback(() => mp4.stopVideoRecording());
  }, [traj, mp4]);

  const durationSec =
    traj.keyframeCount > 0
      ? ((traj.keyframeCount * 50) / 1000).toFixed(1)
      : "0.0";

  const isExporting =
    mp4.videoStatus === "recording" && traj.status === "playing";

  return (
    <div className="traj-panel">
      {/* ── Status row ────────────────────────────────────────────────── */}
      <div className="traj-status-row">
        {traj.status === "recording" && (
          <span className="traj-dot traj-dot--rec" />
        )}
        {traj.status === "playing" && (
          <span className="traj-dot traj-dot--play" />
        )}
        {isExporting && (
          <span className="traj-dot traj-dot--export" />
        )}

        <span className="traj-label">
          {traj.status === "recording" &&
            `Rec ${durationSec}s · ${traj.keyframeCount} kf`}
          {traj.status === "playing" && !isExporting &&
            `Playing ${Math.round(traj.playbackProgress * 100)}%`}
          {isExporting &&
            `Exporting ${Math.round(traj.playbackProgress * 100)}%`}
          {traj.status === "idle" && mp4.videoStatus === "idle" &&
            (traj.keyframeCount > 0
              ? `${durationSec}s · ${traj.keyframeCount} kf`
              : "No trajectory")}
        </span>
      </div>

      {/* ── Progress bar (playback / export) ──────────────────────────── */}
      {traj.status === "playing" && (
        <div className="traj-track">
          <div
            className="traj-fill"
            style={{ width: `${traj.playbackProgress * 100}%` }}
          />
        </div>
      )}

      {/* ── Action buttons ────────────────────────────────────────────── */}
      <div className="traj-buttons">
        {traj.status === "idle" && mp4.videoStatus === "idle" && (
          <button className="traj-btn traj-btn--rec" onClick={traj.startRecording}>
            ● Rec
          </button>
        )}

        {traj.status === "recording" && (
          <button className="traj-btn traj-btn--stop" onClick={traj.stopRecording}>
            ■ Stop
          </button>
        )}

        {traj.status === "idle" && traj.keyframeCount >= 2 && mp4.videoStatus === "idle" && (
          <button className="traj-btn traj-btn--play" onClick={() => traj.startPlayback()}>
            ▶ Play
          </button>
        )}

        {traj.status === "playing" && mp4.videoStatus === "idle" && (
          <button className="traj-btn traj-btn--stop" onClick={traj.stopPlayback}>
            ■ Stop
          </button>
        )}

        {traj.status === "idle" && traj.keyframeCount >= 2 && mp4.videoStatus === "idle" && (
          <button className="traj-btn traj-btn--export" onClick={exportVideo}>
            ↓ Export
          </button>
        )}

        {isExporting && (
          <button
            className="traj-btn traj-btn--stop"
            onClick={() => {
              traj.stopPlayback();
              mp4.stopVideoRecording();
            }}
          >
            ■ Abort
          </button>
        )}

        {traj.status === "idle" && traj.keyframeCount > 0 && mp4.videoStatus === "idle" && (
          <button className="traj-btn traj-btn--clear" onClick={traj.clearTrajectory}>
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
