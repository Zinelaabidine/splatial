"use client";

import { Camera, Film, Home, Route } from "lucide-react";

import { useCameraTrajectoryContext } from "@/hooks/viewer/CameraTrajectoryContext";
import { resetView } from "@/viewer/engine/viewer";
import { cn } from "@/lib/utils";

export type DockPanelId = "shots" | "tours" | "trajectory";

type ViewerDockProps = {
  activePanel: DockPanelId | null;
  onSelect: (panel: DockPanelId) => void;
  /** Hide the Shots button entirely when the viewer has no sceneId (e.g. embeds). */
  showShots?: boolean;
  /** Hide the Tours button entirely when the viewer has no sceneId. */
  showTours?: boolean;
  /** Trajectory recording is a creator-only dev tool. */
  showTrajectory?: boolean;
};

/**
 * Single bottom-center control dock for the splat viewer.
 *
 * Replaces three independently-floating widgets (Shots top-right, Tours
 * bottom-right, Trajectory bottom-left) with one row of toggle buttons that
 * each expand the corresponding panel directly above the dock. "Home" is a
 * plain action (not a toggle) that recovers the camera after it drifts
 * outside the reconstructed splat volume — there was previously no way back
 * short of reloading the page.
 */
export default function ViewerDock({
  activePanel,
  onSelect,
  showShots = true,
  showTours = true,
  showTrajectory = true,
}: ViewerDockProps) {
  const traj = useCameraTrajectoryContext();
  const trajectoryActive = traj.status !== "idle";

  return (
    <div className="viewer-dock" role="toolbar" aria-label="Viewer controls">
      <button
        type="button"
        className="viewer-dock-btn"
        title="Reset camera to the default view"
        aria-label="Reset camera to the default view"
        onClick={() => resetView()}
      >
        <Home className="size-4" strokeWidth={1.75} aria-hidden />
        <span className="hidden sm:inline">Home</span>
      </button>

      {showTours ? (
        <button
          type="button"
          className={cn(
            "viewer-dock-btn",
            activePanel === "tours" && "viewer-dock-btn--active",
          )}
          aria-pressed={activePanel === "tours"}
          aria-label="Tours"
          title="Tours"
          onClick={() => onSelect("tours")}
        >
          <Route className="size-4" strokeWidth={1.75} aria-hidden />
          <span className="hidden sm:inline">Tours</span>
        </button>
      ) : null}

      {showShots ? (
        <button
          type="button"
          className={cn(
            "viewer-dock-btn",
            activePanel === "shots" && "viewer-dock-btn--active",
          )}
          aria-pressed={activePanel === "shots"}
          aria-label="Shots"
          title="Shots"
          onClick={() => onSelect("shots")}
        >
          <Camera className="size-4" strokeWidth={1.75} aria-hidden />
          <span className="hidden sm:inline">Shots</span>
        </button>
      ) : null}

      {showTrajectory ? (
        <button
          type="button"
          className={cn(
            "viewer-dock-btn",
            activePanel === "trajectory" && "viewer-dock-btn--active",
          )}
          aria-pressed={activePanel === "trajectory"}
          aria-label={
            trajectoryActive ? "Trajectory (recording or playing)" : "Trajectory"
          }
          title="Trajectory"
          onClick={() => onSelect("trajectory")}
        >
          <span className="relative flex items-center">
            <Film className="size-4" strokeWidth={1.75} aria-hidden />
            {trajectoryActive ? (
              <span className="viewer-dock-dot" aria-hidden />
            ) : null}
          </span>
          <span className="hidden sm:inline">Trajectory</span>
        </button>
      ) : null}
    </div>
  );
}
