import {
  applyViewMatrix,
  clearOverrideMatrix,
  disposeControls,
  getViewMatrixSnapshot,
  isViewerStarted,
  runViewer,
  setOverrideMatrix,
  setViewerStarted,
} from "./viewerState";

export async function startViewer(splatUrl) {
  if (isViewerStarted()) return;
  setViewerStarted(true);
  try {
    await runViewer(splatUrl);
  } catch (err) {
    const spinnerEl = document.getElementById("spinner");
    if (spinnerEl) spinnerEl.style.display = "none";
    const messageEl = document.getElementById("message");
    if (messageEl) messageEl.innerText = err.toString();
    const downloadOverlay = document.getElementById("download-overlay");
    if (downloadOverlay) downloadOverlay.style.display = "none";
    console.error(err);
  }
}

export function stopViewer() {
  setViewerStarted(false);
  disposeControls();
}

// ─── Camera trajectory API ───────────────────────────────────────────────────

/** Returns a snapshot of the current view matrix (16-element column-major array). */
export function readViewMatrix() {
  return getViewMatrixSnapshot();
}

/** Jump the live camera to a saved view matrix (keeps user control afterward). */
export { applyViewMatrix, isViewerStarted };

/** Overrides the view matrix every frame for trajectory playback. Pass null to release. */
export function setViewMatrix(m) {
  setOverrideMatrix(m);
}

/** Alias for setViewMatrix — external camera matrix update API. */
export function updateCameraMatrix(m) {
  setViewMatrix(m);
}

/** Releases any external view matrix override, returning camera control to the user. */
export function clearViewMatrix() {
  clearOverrideMatrix();
}
