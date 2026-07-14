"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";

type SceneTaxonomyDisplayProps = {
  category?: string | null;
  tags?: string[];
  /** When true, category and tags link to filtered explore views. */
  linkFilters?: boolean;
  className?: string;
};

export default function SceneTaxonomyDisplay({
  category,
  tags = [],
  linkFilters = true,
  className,
}: SceneTaxonomyDisplayProps) {
  const hasCategory = typeof category === "string" && category.trim() !== "";
  const visibleTags = tags.filter((t) => t.trim() !== "");

  if (!hasCategory && visibleTags.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {hasCategory ? (
        linkFilters ? (
          <Link
            href={`/explore?category=${encodeURIComponent(category)}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex rounded-md bg-[var(--nord-tint)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--nord-ink)] ring-1 ring-[var(--nord-hairline)] transition-colors hover:bg-[var(--nord-tint)] hover:text-[var(--nord-ink)]"
          >
            {category}
          </Link>
        ) : (
          <span className="inline-flex rounded-md bg-[var(--nord-tint)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--nord-slate)] ring-1 ring-[var(--nord-hairline)]">
            {category}
          </span>
        )
      ) : null}

      {visibleTags.map((tag) =>
        linkFilters ? (
          <Link
            key={tag}
            href={`/explore?tag=${encodeURIComponent(tag)}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex rounded-md bg-[var(--nord-tint)] px-1.5 py-0.5 text-[10.5px] text-[var(--nord-slate)] ring-1 ring-[var(--nord-hairline)] transition-colors hover:bg-[var(--nord-tint)] hover:text-[var(--nord-ink)]"
          >
            #{tag}
          </Link>
        ) : (
          <span
            key={tag}
            className="inline-flex rounded-md bg-[var(--nord-tint)] px-1.5 py-0.5 text-[10.5px] text-[var(--nord-slate)] ring-1 ring-[var(--nord-hairline)]"
          >
            #{tag}
          </span>
        ),
      )}
    </div>
  );
}
