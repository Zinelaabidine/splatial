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
            className="inline-flex rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#a1a1aa] ring-1 ring-white/10 transition-colors hover:bg-white/10 hover:text-white"
          >
            {category}
          </Link>
        ) : (
          <span className="inline-flex rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#a1a1aa] ring-1 ring-white/10">
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
            className="inline-flex rounded-md bg-white/[0.03] px-1.5 py-0.5 text-[10.5px] text-[#84848c] ring-1 ring-white/8 transition-colors hover:bg-white/10 hover:text-white"
          >
            #{tag}
          </Link>
        ) : (
          <span
            key={tag}
            className="inline-flex rounded-md bg-white/[0.03] px-1.5 py-0.5 text-[10.5px] text-[#84848c] ring-1 ring-white/8"
          >
            #{tag}
          </span>
        ),
      )}
    </div>
  );
}
