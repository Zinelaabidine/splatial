"use client";

import { ChevronDown } from "lucide-react";

import { usePageSearch } from "@/components/layout/AppShellContext";
import SplatCard from "@/components/splatworks/SplatCard";
import { useSplatsGallery } from "@/hooks/splats/useSplatsGallery";

const SORT_LABELS = {
  newest: "Newest",
  oldest: "Oldest",
  name: "Name",
} as const;

export default function SplatsGalleryView() {
  const { search, setSearch } = usePageSearch("Search splats");
  const gallery = useSplatsGallery(search, setSearch);

  const {
    splats,
    sortBy,
    setSortBy,
    sortOpen,
    setSortOpen,
    sortOptions,
    open3D,
    startTour,
    openDetail,
    download,
    share,
    rename,
    remove,
  } = gallery;

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
          Splatworks: My Splats
        </h1>

        <div className="relative">
          <button
            type="button"
            onClick={() => setSortOpen((o) => !o)}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-[#303030] bg-[#212121] px-3 text-sm text-[#e5e5e5] hover:bg-[#303030]"
          >
            {SORT_LABELS[sortBy]}
            <ChevronDown className="h-4 w-4 text-[#909090]" />
          </button>
          {sortOpen && (
            <div className="absolute right-0 top-full z-10 mt-1 min-w-[140px] rounded-lg border border-[#303030] bg-[#212121] py-1 shadow-xl">
              {sortOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setSortBy(option);
                    setSortOpen(false);
                  }}
                  className="block w-full px-4 py-2 text-left text-sm text-[#e5e5e5] hover:bg-[#303030]"
                >
                  {SORT_LABELS[option]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {splats.length === 0 ? (
        <p className="py-16 text-center text-sm text-[#909090]">
          No splats match your search.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {splats.map((splat) => (
            <SplatCard
              key={splat.id}
              splat={splat}
              onOpen3D={open3D}
              onTour={startTour}
              onCardClick={openDetail}
              onDownload={download}
              onShare={share}
              onRename={rename}
              onDelete={remove}
            />
          ))}
        </div>
      )}
    </div>
  );
}
