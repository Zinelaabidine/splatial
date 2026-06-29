"use client";

import { useEffect } from "react";
import { CameraTrajectoryProvider } from "@/hooks/viewer/CameraTrajectoryContext";
import { startViewer, stopViewer } from "@/viewer/engine/viewer";
import ShotsPanel from "@/components/viewer/ShotsPanel";
import ToursPanel from "@/components/viewer/ToursPanel";
import TrajectoryControls from "@/components/viewer/TrajectoryControls";

interface LegacySplatViewerProps {
  /** Absolute, pre-signed URL pointing to a .splat or .ply file. */
  splatUrl: string;
  /** When set, enables the Shots panel and deep-link handling. */
  sceneId?: string;
  shotId?: string | null;
  tourId?: string | null;
  isSceneOwner?: boolean;
}

/**
 * Mounts the legacy WebGL Gaussian splat viewer inside the current page.
 *
 * The component renders every DOM node the imperative viewer.js engine looks
 * up via document.getElementById(), then calls startViewer(splatUrl) after
 * the first paint.  On unmount it calls stopViewer() so the module-level
 * guard allows a fresh start if the component is re-mounted.
 */
export default function LegacySplatViewer({
  splatUrl,
  sceneId,
  shotId,
  tourId,
  isSceneOwner = false,
}: LegacySplatViewerProps) {
  useEffect(() => {
    if (!splatUrl) return;

    startViewer(splatUrl);

    return () => {
      stopViewer();
    };
  }, [splatUrl]);

  return (
    <div className="splat-viewer-container">
      <div id="info">
        <details>
          <summary>Use mouse or arrow keys to navigate.</summary>
          <div id="instructions">{INSTRUCTIONS}</div>
        </details>
      </div>

      <div id="progress" />
      <div id="message" />

      <div id="download-overlay" className="download-overlay" style={{ display: "none" }}>
        <div className="download-box">
          <div id="download-percentage" className="download-percentage">
            Downloading… 0%
          </div>
          <div className="download-bar">
            <div
              id="download-bar-fill"
              className="download-bar-fill"
              style={{ width: "0%" }}
            />
          </div>
        </div>
      </div>

      <div className="scene" id="spinner">
        <div className="cube-wrapper">
          <div className="cube">
            <div className="cube-faces">
              <div className="cube-face bottom" />
              <div className="cube-face top" />
              <div className="cube-face left" />
              <div className="cube-face right" />
              <div className="cube-face back" />
              <div className="cube-face front" />
            </div>
          </div>
        </div>
      </div>

      <canvas id="canvas" />

      <div id="quality">
        <span id="fps" />
      </div>
      <div id="caminfo">
        <span id="camid" />
      </div>

      <CameraTrajectoryProvider>
        <TrajectoryControls />
        {sceneId ? (
          <>
            <ShotsPanel
              sceneId={sceneId}
              shotId={shotId}
              isSceneOwner={isSceneOwner}
            />
            <ToursPanel
              sceneId={sceneId}
              tourId={tourId}
              isSceneOwner={isSceneOwner}
            />
          </>
        ) : null}
      </CameraTrajectoryProvider>
    </div>
  );
}

const INSTRUCTIONS = `movement (arrow keys)
- left/right arrow keys to strafe side to side
- up/down arrow keys to move forward/back
- space to jump

camera angle (wasd)
- a/d to turn camera left/right
- w/s to tilt camera up/down
- q/e to roll camera counterclockwise/clockwise
- i/k and j/l to orbit

trackpad
- scroll up/down/left/right to orbit
- pinch to move forward/back
- ctrl key + scroll to move forward/back
- shift + scroll to move up/down or strafe

mouse
- click and drag to orbit
- right click (or ctrl/cmd key) and drag up/down to move

touch (mobile)
- one finger to orbit
- two finger pinch to move forward/back
- two finger rotate to rotate camera clockwise/counterclockwise
- two finger pan to move side-to-side and up-down

gamepad
- if you have a game controller connected it should work

other
- press 0-9 to switch to one of the pre-loaded camera views
- press '-' or '+' to cycle loaded cameras
- press p to resume default animation
- drag and drop .ply file to convert to .splat
- drag and drop cameras.json to load cameras`;
