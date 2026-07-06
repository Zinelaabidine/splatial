/**
 * Starts the legacy WebGL Gaussian splat viewer.
 * @param splatUrl - Absolute URL to a .splat or .ply file.
 */
export function startViewer(splatUrl: string): Promise<void>;

/**
 * Signals the viewer to allow re-initialisation on the next startViewer() call.
 * Note: the underlying requestAnimationFrame loop is not cancelled; call this
 * only when the host component is being unmounted.
 */
export function stopViewer(): void;

// ─── Camera trajectory API ────────────────────────────────────────────────────

/** Returns a snapshot of the current view matrix (16-element column-major). */
export function readViewMatrix(): number[] | null;

/**
 * Overrides the view matrix applied each frame.
 * Pass null (or call clearViewMatrix) to return control to the user.
 */
export function setViewMatrix(m: number[] | null): void;

/**
 * External camera matrix update API (alias for setViewMatrix).
 * Pass null to release the override.
 */
export function updateCameraMatrix(m: number[] | null): void;

/** Releases any external view matrix override. */
export function clearViewMatrix(): void;

/** Jump the live camera to a saved view matrix (keeps user control afterward). */
export function applyViewMatrix(m: number[]): void;

/** True after startViewer has begun initialising the engine. */
export function isViewerStarted(): boolean;

/**
 * Snaps the live camera back to the scene's default view and clears any
 * trajectory override. Recovers a camera that drifted outside the
 * reconstructed splat volume — wired to the viewer dock's "Home" button.
 */
export function resetView(): void;
