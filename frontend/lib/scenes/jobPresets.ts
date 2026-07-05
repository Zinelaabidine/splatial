import type { ColmapConfig, TrainConfig } from "@/types/api";

export interface JobPreset {
  id: string;
  label: string;
  /** One-line explanation shown as a tooltip / helper caption. */
  description: string;
  trainConfig: TrainConfig;
  colmapConfig: ColmapConfig;
}

/**
 * Curated speed/quality tradeoffs for job submission. Each preset fully
 * replaces the current trainConfig/colmapConfig (not merged) so switching
 * between presets is predictable — no leftover fields from a previous pick.
 *
 * "Balanced" mirrors today's server-side defaults exactly (worker/worker.py
 * DEFAULT_TRAIN_CONFIG / DEFAULT_COLMAP_CONFIG), so picking it is equivalent
 * to submitting with no overrides at all.
 */
export const JOB_PRESETS: readonly JobPreset[] = [
  {
    id: "fast",
    label: "Fast",
    description:
      "Quick draft preview. Smaller images, fewer iterations — good for checking a capture before committing to a full run.",
    colmapConfig: {
      matcher: "sequential",
      max_image_size: 1000,
      max_num_features: 2048,
      sequential_overlap: 8,
      ba_tolerance: 0.001,
    },
    trainConfig: {
      iterations: 7000,
      sh_degree: 1,
      resolution: 4,
      densify_until_iter: 3000,
      densify_grad_threshold: 0.0004,
    },
  },
  {
    id: "balanced",
    label: "Balanced",
    description:
      "The standard preset — a good default for most scenes. Same as submitting with no overrides.",
    colmapConfig: {
      matcher: "sequential",
      max_image_size: 1600,
      max_num_features: 4096,
      sequential_overlap: 10,
      ba_tolerance: 0.0001,
    },
    trainConfig: {
      iterations: 15000,
      sh_degree: 2,
      resolution: 2,
      densify_until_iter: 7000,
    },
  },
  {
    id: "high_quality",
    label: "High quality",
    description:
      "Best fidelity, slowest. Full-resolution images, exhaustive matching, full 30k-iteration training with eval held out.",
    colmapConfig: {
      matcher: "exhaustive",
      max_image_size: 2400,
      max_num_features: 8192,
      ba_tolerance: 0.00001,
    },
    trainConfig: {
      iterations: 30000,
      sh_degree: 3,
      resolution: 1,
      densify_until_iter: 15000,
      densify_grad_threshold: 0.0001,
      eval: true,
    },
  },
  {
    id: "large_unordered",
    label: "Large photo set",
    description:
      "For large, unordered photo collections (100s–1000s of images) rather than an ordered video walkthrough. Uses vocab-tree matching instead of sequential.",
    colmapConfig: {
      matcher: "vocab_tree",
      vocab_tree_path: "/opt/colmap/vocab_tree_flickr100K_words256K.bin",
      max_image_size: 1600,
      max_num_features: 4096,
    },
    trainConfig: {
      iterations: 15000,
      sh_degree: 2,
      resolution: 2,
      densify_until_iter: 7000,
    },
  },
] as const;

function shallowEqual<T extends object>(a: T, b: T): boolean {
  const aEntries = Object.entries(a as Record<string, unknown>);
  const bRecord = b as Record<string, unknown>;
  if (aEntries.length !== Object.keys(bRecord).length) return false;
  return aEntries.every(([k, v]) => bRecord[k] === v);
}

/** Returns the preset id matching the given configs exactly, or undefined (custom/untouched). */
export function matchingPresetId(
  trainConfig: TrainConfig,
  colmapConfig: ColmapConfig,
): string | undefined {
  return JOB_PRESETS.find(
    (p) =>
      shallowEqual(p.trainConfig, trainConfig) &&
      shallowEqual(p.colmapConfig, colmapConfig),
  )?.id;
}
