"use client";

import { type RefObject } from "react";
import { ChevronDown, LayoutGrid, List } from "lucide-react";

import { STATUS_LABELS } from "@/components/splatial/StatusDot";
import { SORT_LABELS } from "@/lib/scenes/sceneMappers";
import { cn } from "@/lib/utils";
import type { StatusFilter } from "@/hooks/scenes/useScenesDashboardGrid";
import type { SortOption } from "@/types/dashboard";
import type { SceneViewMode } from "@/hooks/scenes/useScenesDashboardGrid";

const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  all: "All",
  ...STATUS_LABELS,
};

type DashboardToolbarProps = {
  statusFilter: StatusFilter;
  statusOpen: boolean;
  onStatusToggle: () => void;
  onStatusSelect: (filter: StatusFilter) => void;
  statusOptions: StatusFilter[];
  statusRef: RefObject<HTMLDivElement | null>;
  sortBy: SortOption;
  sortOpen: boolean;
  onSortToggle: () => void;
  onSortSelect: (sort: SortOption) => void;
  sortOptions: SortOption[];
  sortRef: RefObject<HTMLDivElement | null>;
  viewMode: SceneViewMode;
  onViewModeChange: (mode: SceneViewMode) => void;
};

function ToolbarDropdown({
  label,
  value,
  open,
  onToggle,
  options,
  onSelect,
  containerRef,
}: {
  label: string;
  value: string;
  open: boolean;
  onToggle: () => void;
  options: { key: string; label: string }[];
  onSelect: (key: string) => void;
  containerRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={onToggle}
        className="flex h-9 items-center gap-2 rounded-lg px-3 text-[13px] font-medium text-[var(--nord-ink)] transition-colors hover:bg-[var(--nord-tint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nord-hairline)]"
      >
        <span className="text-[var(--nord-slate)]">{label}</span>
        <span>{value}</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-[var(--nord-slate)] transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="sw-popover absolute right-0 top-full z-20 mt-1.5 min-w-[148px] overflow-hidden rounded-xl py-1">
          {options.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => onSelect(option.key)}
              className={cn(
                "block w-full px-3.5 py-2 text-left text-[13px] transition-colors hover:bg-[var(--nord-tint)]",
                option.key === value ? "font-medium text-[var(--nord-ink)]" : "text-[var(--nord-ink)]",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DashboardToolbar({
  statusFilter,
  statusOpen,
  onStatusToggle,
  onStatusSelect,
  statusOptions,
  statusRef,
  sortBy,
  sortOpen,
  onSortToggle,
  onSortSelect,
  sortOptions,
  sortRef,
  viewMode,
  onViewModeChange,
}: DashboardToolbarProps) {
  return (
    <div className="sw-toolbar-cluster">
      <ToolbarDropdown
        label="Status"
        value={STATUS_FILTER_LABELS[statusFilter]}
        open={statusOpen}
        onToggle={onStatusToggle}
        options={statusOptions.map((option) => ({
          key: option,
          label: STATUS_FILTER_LABELS[option],
        }))}
        onSelect={(key) => onStatusSelect(key as StatusFilter)}
        containerRef={statusRef}
      />

      <span className="mx-0.5 h-5 w-px bg-[var(--nord-tint)]" aria-hidden />

      <ToolbarDropdown
        label="Sort"
        value={SORT_LABELS[sortBy]}
        open={sortOpen}
        onToggle={onSortToggle}
        options={sortOptions.map((option) => ({
          key: option,
          label: SORT_LABELS[option],
        }))}
        onSelect={(key) => onSortSelect(key as SortOption)}
        containerRef={sortRef}
      />

      <span className="mx-0.5 h-5 w-px bg-[var(--nord-tint)]" aria-hidden />

      <div
        className="flex h-9 items-center rounded-lg p-1"
        role="group"
        aria-label="View mode"
      >
        <button
          type="button"
          aria-label="Grid view"
          aria-pressed={viewMode === "grid"}
          onClick={() => onViewModeChange("grid")}
          className={cn(
            "flex h-7 w-8 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nord-hairline)]",
            viewMode === "grid"
              ? "bg-[var(--nord-surface)] text-[var(--nord-ink)]"
              : "text-[var(--nord-slate)] hover:bg-[var(--nord-tint)] hover:text-[var(--nord-ink)]",
          )}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="List view"
          aria-pressed={viewMode === "list"}
          onClick={() => onViewModeChange("list")}
          className={cn(
            "flex h-7 w-8 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nord-hairline)]",
            viewMode === "list"
              ? "bg-[var(--nord-surface)] text-[var(--nord-ink)]"
              : "text-[var(--nord-slate)] hover:bg-[var(--nord-tint)] hover:text-[var(--nord-ink)]",
          )}
        >
          <List className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
