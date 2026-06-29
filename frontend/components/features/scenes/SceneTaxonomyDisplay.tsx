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
            className="inline-flex rounded-full bg-violet-950/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-300 ring-1 ring-violet-800/50 transition-colors hover:bg-violet-900/50 hover:text-violet-200"
          >
            {category}
          </Link>
        ) : (
          <span className="inline-flex rounded-full bg-violet-950/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-300 ring-1 ring-violet-800/50">
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
            className="inline-flex rounded-md bg-[#303030] px-2 py-0.5 text-[11px] text-[#d4d4d4] ring-1 ring-[#404040] transition-colors hover:bg-[#363636] hover:text-white"
          >
            #{tag}
          </Link>
        ) : (
          <span
            key={tag}
            className="inline-flex rounded-md bg-[#303030] px-2 py-0.5 text-[11px] text-[#d4d4d4] ring-1 ring-[#404040]"
          >
            #{tag}
          </span>
        ),
      )}
    </div>
  );
}
