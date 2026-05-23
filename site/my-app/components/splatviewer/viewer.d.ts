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
