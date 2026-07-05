"use strict";

/**
 * Validation + defaults for the "advanced configuration" fields on POST /jobs/submit:
 * trainConfig (Gaussian Splatting train.py) and colmapConfig (convert.py / COLMAP).
 *
 * This is the boundary validation layer — worker.py has its own allowlists too
 * (defense in depth), but nothing here should ever forward an unvalidated value
 * into an SQS message that ends up as a subprocess argv. Field lists mirror
 * worker/worker.py's DEFAULT_TRAIN_CONFIG / DEFAULT_COLMAP_CONFIG and their
 * ALLOWED_KEYS — keep both in sync when adding a knob.
 */

/** Default training preset; request trainConfig keys override these. */
const DEFAULT_TRAIN_CONFIG = Object.freeze({
  iterations:         15000,
  densify_until_iter: 7000,
  resolution:         2,
  sh_degree:          2,
});

/** Default COLMAP preset; request colmapConfig keys override these. */
const DEFAULT_COLMAP_CONFIG = Object.freeze({
  matcher:            "sequential",
  camera:             "OPENCV",
  max_image_size:     1600,
  max_num_features:   4096,
  sequential_overlap: 10,
  ba_tolerance:        0.0001,
  no_gpu:              false,
});

// Must match worker/worker.py ALLOWED_VOCAB_TREE_PATHS exactly.
const ALLOWED_VOCAB_TREE_PATHS = new Set([
  "/opt/colmap/vocab_tree_flickr100K_words256K.bin",
]);

const ALLOWED_CAMERA_MODELS = new Set(["OPENCV", "PINHOLE", "SIMPLE_PINHOLE", "SIMPLE_RADIAL", "RADIAL"]);
const ALLOWED_MATCHERS = new Set(["sequential", "exhaustive", "vocab_tree"]);

function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

function isIntInRange(v, min, max) {
  return isFiniteNumber(v) && Number.isInteger(v) && v >= min && v <= max;
}

function isFloatInRange(v, min, max) {
  return isFiniteNumber(v) && v >= min && v <= max;
}

function isIntOrIntArray(v, min, max) {
  if (isIntInRange(v, min, max)) return true;
  return Array.isArray(v) && v.length > 0 && v.every((x) => isIntInRange(x, min, max));
}

/**
 * Field validators for trainConfig. Each returns true/false; validate() below
 * collects one error message per failing key.
 */
const TRAIN_CONFIG_VALIDATORS = {
  data_device:              (v) => v === "cuda" || v === "cpu",
  resolution:               (v) => v === -1 || isIntInRange(v, 1, 8),
  sh_degree:                (v) => isIntInRange(v, 0, 3),
  iterations:               (v) => isIntInRange(v, 100, 100000),
  densify_from_iter:        (v) => isIntInRange(v, 0, 100000),
  densify_until_iter:       (v) => isIntInRange(v, 0, 100000),
  densify_grad_threshold:   (v) => isFloatInRange(v, 0, 1),
  lambda_dssim:             (v) => isFloatInRange(v, 0, 1),
  eval:                     (v) => typeof v === "boolean",
  white_background:         (v) => typeof v === "boolean",
  test_iterations:          (v) => isIntOrIntArray(v, 1, 100000),
  save_iterations:          (v) => isIntOrIntArray(v, 1, 100000),
  checkpoint_iterations:    (v) => isIntOrIntArray(v, 1, 100000),
  opacity_reset_interval:   (v) => isIntInRange(v, 1, 100000),
  densification_interval:   (v) => isIntInRange(v, 1, 10000),
  percent_dense:            (v) => isFloatInRange(v, 0, 1),
  position_lr_init:         (v) => isFloatInRange(v, 0, 1),
  position_lr_final:        (v) => isFloatInRange(v, 0, 1),
  position_lr_delay_mult:   (v) => isFloatInRange(v, 0, 1),
  position_lr_max_steps:    (v) => isIntInRange(v, 1, 100000),
  feature_lr:               (v) => isFloatInRange(v, 0, 1),
  opacity_lr:               (v) => isFloatInRange(v, 0, 1),
  scaling_lr:               (v) => isFloatInRange(v, 0, 1),
  rotation_lr:              (v) => isFloatInRange(v, 0, 1),
  random_background:        (v) => typeof v === "boolean",
  train_test_exp:           (v) => typeof v === "boolean",
  exposure_lr_init:         (v) => isFloatInRange(v, 0, 1),
  exposure_lr_final:        (v) => isFloatInRange(v, 0, 1),
  exposure_lr_delay_steps:  (v) => isIntInRange(v, 0, 100000),
  exposure_lr_delay_mult:   (v) => isFloatInRange(v, 0, 1),
  antialiasing:             (v) => typeof v === "boolean",
};

/** Field validators for colmapConfig. */
const COLMAP_CONFIG_VALIDATORS = {
  matcher:            (v) => ALLOWED_MATCHERS.has(v),
  camera:             (v) => ALLOWED_CAMERA_MODELS.has(v),
  max_image_size:     (v) => isIntInRange(v, 512, 3200),
  max_num_features:   (v) => isIntInRange(v, 512, 16384),
  sequential_overlap: (v) => isIntInRange(v, 1, 50),
  ba_tolerance:       (v) => isFloatInRange(v, 0, 1),
  vocab_tree_path:    (v) => typeof v === "string" && ALLOWED_VOCAB_TREE_PATHS.has(v),
  no_gpu:             (v) => typeof v === "boolean",
};

/**
 * Validate + merge a user-supplied config object over its defaults.
 *
 * Returns { ok: true, value } or { ok: false, errors: string[] }.
 * Unknown keys are rejected (not silently dropped) so the client finds out
 * immediately rather than assuming a typo'd field took effect.
 */
function validateAndMerge(input, { validators, defaults, label }) {
  if (input === undefined || input === null) {
    return { ok: true, value: { ...defaults } };
  }
  if (!isPlainObject(input)) {
    return { ok: false, errors: [`${label} must be a plain object`] };
  }

  const errors = [];
  const merged = { ...defaults };

  for (const [key, value] of Object.entries(input)) {
    const validator = validators[key];
    if (!validator) {
      errors.push(`${label}.${key} is not a recognized field`);
      continue;
    }
    if (!validator(value)) {
      errors.push(`${label}.${key} has an invalid value: ${JSON.stringify(value)}`);
      continue;
    }
    merged[key] = value;
  }

  // vocab_tree_path is required precisely when matcher is vocab_tree.
  if (label === "colmapConfig" && merged.matcher === "vocab_tree" && !merged.vocab_tree_path) {
    errors.push("colmapConfig.vocab_tree_path is required when matcher is 'vocab_tree'");
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: merged };
}

function validateTrainConfig(input) {
  return validateAndMerge(input, {
    validators: TRAIN_CONFIG_VALIDATORS,
    defaults: DEFAULT_TRAIN_CONFIG,
    label: "trainConfig",
  });
}

function validateColmapConfig(input) {
  return validateAndMerge(input, {
    validators: COLMAP_CONFIG_VALIDATORS,
    defaults: DEFAULT_COLMAP_CONFIG,
    label: "colmapConfig",
  });
}

module.exports = {
  DEFAULT_TRAIN_CONFIG,
  DEFAULT_COLMAP_CONFIG,
  validateTrainConfig,
  validateColmapConfig,
};
