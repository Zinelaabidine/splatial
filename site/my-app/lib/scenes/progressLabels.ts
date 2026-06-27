/** Worker-reported pipeline phase (API progressPhase). */
export type WorkerProgressPhase =
  | "INIT"
  | "PREPARATION"
  | "COLMAP"
  | "TRAINING"
  | "POST_PROCESSING"
  | "EXPORT"
  | "FINALIZE";

/** COLMAP sub-steps reported by the worker (API progressSubPhase). */
export type ColmapSubPhase =
  | "COLMAP_FEATURE"
  | "COLMAP_MATCH"
  | "COLMAP_SPARSE"
  | "COLMAP_UNDISTORT";

const PHASE_LABELS: Record<string, string> = {
  INIT: "Starting",
  PREPARATION: "Preparing images",
  COLMAP: "Structure from motion",
  TRAINING: "Training splat",
  POST_PROCESSING: "Post-processing",
  EXPORT: "Exporting",
  FINALIZE: "Finishing",
};

const COLMAP_SUBPHASE_LABELS: Record<ColmapSubPhase, string> = {
  COLMAP_FEATURE: "Extracting features",
  COLMAP_MATCH: "Matching images",
  COLMAP_SPARSE: "Building sparse map",
  COLMAP_UNDISTORT: "Undistorting images",
};

/** Human-readable label for a worker progress phase. */
export function formatProgressPhase(phase: string | undefined): string | undefined {
  if (!phase) return undefined;
  return PHASE_LABELS[phase] ?? phase.replace(/_/g, " ").toLowerCase();
}

/** Human-readable label for a COLMAP sub-step. */
export function formatProgressSubPhase(
  subPhase: string | undefined,
): string | undefined {
  if (!subPhase) return undefined;
  const known = COLMAP_SUBPHASE_LABELS[subPhase as ColmapSubPhase];
  if (known) return known;
  return subPhase.replace(/^COLMAP_/, "").replace(/_/g, " ").toLowerCase();
}

/** Compact ETA string from seconds (e.g. "8m", "1h 5m"). */
export function formatEtaSeconds(seconds: number | undefined): string | undefined {
  if (seconds == null || !Number.isFinite(seconds)) return undefined;
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  if (minutes < 60) {
    return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/** Best caption for an in-flight processing scene. */
export function processingStatusCaption(
  progressPhase?: string,
  progressSubPhase?: string,
): string {
  const sub = formatProgressSubPhase(progressSubPhase);
  if (sub) return sub;
  const phase = formatProgressPhase(progressPhase);
  if (phase) return phase;
  return "Processing";
}
