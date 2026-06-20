"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { MOCK_SPLATS } from "@/fixtures/mockSplats";
import type { Splat, SplatsSortOption, SplatsViewMode } from "@/types/splatworks";

const SORT_OPTIONS: SplatsSortOption[] = ["newest", "oldest", "name"];

/** Relative date weight for mock sorting (lower = newer). */
const RECENCY: Record<string, number> = {
  "1 week ago": 1,
  "2 weeks ago": 2,
  "3 weeks ago": 3,
};

export function useSplatsGallery(
  search: string,
  _setSearch: (value: string) => void,
) {
  const router = useRouter();
  const [sortBy, setSortBy] = useState<SplatsSortOption>("newest");
  const [sortOpen, setSortOpen] = useState(false);
  const [viewMode, setViewMode] = useState<SplatsViewMode>("grid");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q
      ? MOCK_SPLATS.filter((s) => s.title.toLowerCase().includes(q))
      : [...MOCK_SPLATS];

    switch (sortBy) {
      case "name":
        list.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "oldest":
        list.sort(
          (a, b) =>
            (RECENCY[a.createdAt] ?? 99) - (RECENCY[b.createdAt] ?? 99),
        );
        break;
      default:
        list.sort(
          (a, b) =>
            (RECENCY[b.createdAt] ?? 0) - (RECENCY[a.createdAt] ?? 0),
        );
    }
    return list;
  }, [search, sortBy]);

  const open3D = (splat: Splat) => {
    if (splat.sceneId) {
      router.push(`/scenes/view?id=${splat.sceneId}`);
      return;
    }
    // TODO: wire full-screen WebGL splat viewer route
    router.push(`/scenes/view?id=${splat.id}`);
  };

  const startTour = (splat: Splat) => {
    // TODO: play pre-authored camera fly-through
    console.info("[Splatworks] Tour not implemented", splat.id);
  };

  const openDetail = (splat: Splat) => {
    // TODO: scene/splat detail view
    console.info("[Splatworks] Detail view not implemented", splat.id);
  };

  const download = (splat: Splat, format: "ply" | "splat") => {
    // TODO: trigger download via presigned URL
    console.info("[Splatworks] Download", format, splat.id);
  };

  const share = (splat: Splat) => {
    // TODO: open share dialog
    console.info("[Splatworks] Share", splat.id);
  };

  const rename = (splat: Splat) => {
    // TODO: inline rename modal
    console.info("[Splatworks] Rename", splat.id);
  };

  const remove = (splat: Splat) => {
    // TODO: confirm delete via API
    console.info("[Splatworks] Delete", splat.id);
  };

  return {
    splats: filtered,
    count: filtered.length,
    sortBy,
    setSortBy,
    sortOpen,
    setSortOpen,
    sortOptions: SORT_OPTIONS,
    viewMode,
    setViewMode,
    open3D,
    startTour,
    openDetail,
    download,
    share,
    rename,
    remove,
  };
}
