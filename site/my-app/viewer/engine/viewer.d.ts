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
export function setViewMatrix(m: number[]): void;

/** Releases any external view matrix override. */
export function clearViewMatrix(): void;
