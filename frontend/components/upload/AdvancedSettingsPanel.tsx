"use client";

import { JOB_PRESETS, matchingPresetId } from "@/lib/scenes/jobPresets";
import { cn } from "@/lib/utils";
import type { ColmapConfig, TrainConfig } from "@/types/api";

interface AdvancedSettingsPanelProps {
  trainConfig: TrainConfig;
  colmapConfig: ColmapConfig;
  onTrainConfigChange: (config: TrainConfig) => void;
  onColmapConfigChange: (config: ColmapConfig) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Field definitions — data-driven so the ~35 knobs don't require hand-written
// JSX per field. Keep in sync with backend/lib/job-config.js's validators
// (min/max here are UX guardrails; the server re-validates independently).
// ---------------------------------------------------------------------------

type NumberField<T> = {
  key: keyof T;
  label: string;
  type: "number";
  min?: number;
  max?: number;
  step?: number;
  /** The value actually used server-side when this field is left blank. */
  default: number;
};

type BoolField<T> = {
  key: keyof T;
  label: string;
  type: "bool";
  default: boolean;
};

type SelectField<T> = {
  key: keyof T;
  label: string;
  type: "select";
  options: readonly string[];
  default: string;
};

type FieldDef<T> = NumberField<T> | BoolField<T> | SelectField<T>;

// Defaults below mirror, field-for-field:
//  - COLMAP: worker/worker.py DEFAULT_COLMAP_CONFIG / backend/lib/job-config.js
//  - Training: the Splatial preset (worker/worker.py DEFAULT_TRAIN_CONFIG) for
//    iterations/densify_until_iter/resolution/sh_degree, and upstream train.py's
//    own argparse defaults (arguments/__init__.py) for everything else.
const COLMAP_FIELDS: FieldDef<ColmapConfig>[] = [
  { key: "matcher", label: "Matcher", type: "select", options: ["sequential", "exhaustive", "vocab_tree"], default: "sequential" },
  { key: "camera", label: "Camera model", type: "select", options: ["OPENCV", "PINHOLE", "SIMPLE_PINHOLE", "SIMPLE_RADIAL", "RADIAL"], default: "OPENCV" },
  { key: "max_image_size", label: "Max image size (px)", type: "number", min: 512, max: 3200, step: 1, default: 1600 },
  { key: "max_num_features", label: "Max SIFT features", type: "number", min: 512, max: 16384, step: 1, default: 4096 },
  { key: "sequential_overlap", label: "Sequential overlap", type: "number", min: 1, max: 50, step: 1, default: 10 },
  { key: "ba_tolerance", label: "Bundle-adjustment tolerance", type: "number", min: 0, max: 1, step: 0.0001, default: 0.0001 },
  { key: "no_gpu", label: "Force CPU (no GPU)", type: "bool", default: false },
];

const TRAIN_CORE_FIELDS: FieldDef<TrainConfig>[] = [
  { key: "iterations", label: "Iterations", type: "number", min: 100, max: 100000, step: 100, default: 15000 },
  { key: "sh_degree", label: "SH degree", type: "number", min: 0, max: 3, step: 1, default: 2 },
  { key: "resolution", label: "Resolution downscale", type: "number", min: -1, max: 8, step: 1, default: 2 },
  { key: "densify_from_iter", label: "Densify from iter", type: "number", min: 0, max: 100000, step: 100, default: 500 },
  { key: "densify_until_iter", label: "Densify until iter", type: "number", min: 0, max: 100000, step: 100, default: 7000 },
  { key: "densify_grad_threshold", label: "Densify grad threshold", type: "number", min: 0, max: 1, step: 0.0001, default: 0.0002 },
  { key: "lambda_dssim", label: "SSIM weight (lambda_dssim)", type: "number", min: 0, max: 1, step: 0.01, default: 0.2 },
  { key: "percent_dense", label: "Percent dense", type: "number", min: 0, max: 1, step: 0.01, default: 0.01 },
  { key: "eval", label: "Hold out test split (eval)", type: "bool", default: false },
  { key: "white_background", label: "White background", type: "bool", default: false },
  { key: "random_background", label: "Randomize background", type: "bool", default: false },
  { key: "data_device", label: "Data device", type: "select", options: ["cuda", "cpu"], default: "cuda" },
];

const TRAIN_LR_FIELDS: FieldDef<TrainConfig>[] = [
  { key: "position_lr_init", label: "Position LR init", type: "number", min: 0, max: 1, step: 0.00001, default: 0.00016 },
  { key: "position_lr_final", label: "Position LR final", type: "number", min: 0, max: 1, step: 0.0000001, default: 0.0000016 },
  { key: "position_lr_delay_mult", label: "Position LR delay mult", type: "number", min: 0, max: 1, step: 0.001, default: 0.01 },
  { key: "position_lr_max_steps", label: "Position LR max steps", type: "number", min: 1, max: 100000, step: 100, default: 30000 },
  { key: "feature_lr", label: "Feature LR", type: "number", min: 0, max: 1, step: 0.0001, default: 0.0025 },
  { key: "opacity_lr", label: "Opacity LR", type: "number", min: 0, max: 1, step: 0.001, default: 0.025 },
  { key: "scaling_lr", label: "Scaling LR", type: "number", min: 0, max: 1, step: 0.0001, default: 0.005 },
  { key: "rotation_lr", label: "Rotation LR", type: "number", min: 0, max: 1, step: 0.0001, default: 0.001 },
  { key: "exposure_lr_init", label: "Exposure LR init", type: "number", min: 0, max: 1, step: 0.001, default: 0.01 },
  { key: "exposure_lr_final", label: "Exposure LR final", type: "number", min: 0, max: 1, step: 0.0001, default: 0.001 },
  { key: "exposure_lr_delay_steps", label: "Exposure LR delay steps", type: "number", min: 0, max: 100000, step: 100, default: 0 },
  { key: "exposure_lr_delay_mult", label: "Exposure LR delay mult", type: "number", min: 0, max: 1, step: 0.01, default: 0 },
];

const TRAIN_ADVANCED_FIELDS: FieldDef<TrainConfig>[] = [
  { key: "opacity_reset_interval", label: "Opacity reset interval", type: "number", min: 1, max: 100000, step: 100, default: 3000 },
  { key: "densification_interval", label: "Densification interval", type: "number", min: 1, max: 10000, step: 10, default: 100 },
  { key: "train_test_exp", label: "Train/test exposure split", type: "bool", default: false },
  { key: "antialiasing", label: "Antialiasing", type: "bool", default: false },
];

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

function FieldRow<T extends object>({
  field,
  config,
  onChange,
}: {
  field: FieldDef<T>;
  config: T;
  onChange: (config: T) => void;
}) {
  const raw = config[field.key];

  if (field.type === "bool") {
    const checked = raw === true;
    return (
      <label className="flex items-center justify-between gap-2 py-1.5 text-xs text-[var(--nord-ink)]">
        <span>
          {field.label}
          <span className="ml-1 text-[var(--nord-slate)]">
            (default: {field.default ? "on" : "off"})
          </span>
        </span>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange({ ...config, [field.key]: e.target.checked })}
          className="h-3.5 w-3.5 shrink-0 rounded border-[var(--nord-hairline)] bg-[var(--nord-tint)] text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0"
        />
      </label>
    );
  }

  if (field.type === "select") {
    const value = typeof raw === "string" ? raw : "";
    return (
      <label className="flex flex-col gap-1 py-1.5 text-xs text-[var(--nord-ink)]">
        <span>{field.label}</span>
        <select
          value={value}
          onChange={(e) =>
            onChange({
              ...config,
              [field.key]: e.target.value === "" ? undefined : e.target.value,
            })
          }
          className="rounded-md border border-[var(--nord-hairline)] bg-[var(--nord-tint)] px-2 py-1 text-xs text-[var(--nord-ink)] focus:border-indigo-400 focus:outline-none [&_option]:bg-[var(--nord-surface)] [&_option]:text-[var(--nord-ink)]"
        >
          <option value="">{field.default} (default)</option>
          {field.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </label>
    );
  }

  // number
  const value = typeof raw === "number" ? String(raw) : "";
  return (
    <label className="flex flex-col gap-1 py-1.5 text-xs text-[var(--nord-ink)]">
      <span>{field.label}</span>
      <input
        type="number"
        value={value}
        min={field.min}
        max={field.max}
        step={field.step ?? 1}
        placeholder={String(field.default)}
        onChange={(e) => {
          const next = e.target.value;
          if (isEmpty(next)) {
            onChange({ ...config, [field.key]: undefined });
            return;
          }
          const parsed = Number(next);
          onChange({ ...config, [field.key]: Number.isNaN(parsed) ? undefined : parsed });
        }}
        className="rounded-md border border-[var(--nord-hairline)] bg-[var(--nord-tint)] px-2 py-1 text-xs text-[var(--nord-ink)] placeholder:text-[var(--nord-slate)] focus:border-indigo-400 focus:outline-none"
      />
    </label>
  );
}

function FieldSection<T extends object>({
  title,
  fields,
  config,
  onChange,
  defaultOpen,
}: {
  title: string;
  fields: FieldDef<T>[];
  config: T;
  onChange: (config: T) => void;
  defaultOpen?: boolean;
}) {
  return (
    <details className="group rounded-lg border border-[var(--nord-hairline)]" open={defaultOpen}>
      <summary className="cursor-pointer select-none list-none rounded-lg px-3 py-2 text-xs font-semibold text-[var(--nord-ink)] hover:bg-[var(--nord-tint)]">
        {title}
      </summary>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0 border-t border-[var(--nord-hairline)] px-3 py-2">
        {fields.map((f) => (
          <FieldRow key={String(f.key)} field={f} config={config} onChange={onChange} />
        ))}
      </div>
    </details>
  );
}

/**
 * Inline "advanced configuration" editor for a single job submission.
 * All fields are optional — an empty field means "use the server default".
 * Values are only validated client-side for basic sanity (min/max on the
 * input); the backend (backend/lib/job-config.js) is the source of truth
 * and will reject anything out of range with a 400.
 */
export default function AdvancedSettingsPanel({
  trainConfig,
  colmapConfig,
  onTrainConfigChange,
  onColmapConfigChange,
  className,
}: AdvancedSettingsPanelProps) {
  const activePresetId = matchingPresetId(trainConfig, colmapConfig);
  const isUntouched =
    Object.keys(trainConfig).length === 0 && Object.keys(colmapConfig).length === 0;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-col gap-1.5 rounded-lg border border-[var(--nord-hairline)] p-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-semibold text-[var(--nord-ink)]">Presets</span>
          <span className="text-[11px] text-[var(--nord-slate)]">
            {activePresetId
              ? JOB_PRESETS.find((p) => p.id === activePresetId)?.label
              : isUntouched
                ? "Default"
                : "Custom"}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {JOB_PRESETS.map((preset) => {
            const active = preset.id === activePresetId;
            return (
              <button
                key={preset.id}
                type="button"
                title={preset.description}
                onClick={() => {
                  onTrainConfigChange(preset.trainConfig);
                  onColmapConfigChange(preset.colmapConfig);
                }}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                  active
                    ? "border-indigo-400/60 bg-indigo-500/20 text-indigo-200"
                    : "border-[var(--nord-hairline)] bg-[var(--nord-tint)] text-[var(--nord-ink)] hover:bg-[var(--nord-tint)] hover:text-[var(--nord-ink)]",
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>
      <FieldSection
        title="COLMAP"
        fields={COLMAP_FIELDS}
        config={colmapConfig}
        onChange={onColmapConfigChange}
      />
      <FieldSection
        title="Training — core"
        fields={TRAIN_CORE_FIELDS}
        config={trainConfig}
        onChange={onTrainConfigChange}
        defaultOpen
      />
      <FieldSection
        title="Training — learning rates"
        fields={TRAIN_LR_FIELDS}
        config={trainConfig}
        onChange={onTrainConfigChange}
      />
      <FieldSection
        title="Training — advanced"
        fields={TRAIN_ADVANCED_FIELDS}
        config={trainConfig}
        onChange={onTrainConfigChange}
      />
      {colmapConfig.matcher === "vocab_tree" ? (
        <p className="px-1 text-[11px] text-[#9a6b1f]">
          vocab_tree requires a vocab tree file baked into the worker AMI; leave
          the path unset to use the operator-configured default.
        </p>
      ) : null}
    </div>
  );
}
