import type { Keyframe } from "@/hooks/viewer/useCameraTrajectory";
import type { TourItem } from "@/types/api";

/** Evenly spaced keyframes from tour stops (no holds between segments). */
export function tourToKeyframes(
  items: TourItem[],
  segmentDurationMs: number,
): Keyframe[] {
  return items.map((item, index) => ({
    t: index * segmentDurationMs,
    matrix: item.matrix,
  }));
}
