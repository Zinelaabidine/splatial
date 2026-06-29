"use client";

import { Menu, Search, X } from "lucide-react";

import { useAppShell } from "@/components/layout/AppShellContext";

type AppTopBarProps = {
  onMenuClick?: () => void;
};

export default function AppTopBar({ onMenuClick }: AppTopBarProps) {
  const { search, setSearch, searchPlaceholder, showSearch } = useAppShell();

  return (
    <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center gap-3 border-b border-[#303030] bg-[#121212] px-4">
      <button
        type="button"
        aria-label="Menu"
        onClick={onMenuClick}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#f1f1f1] hover:bg-[#212121] md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {showSearch ? (
        <div className="mx-auto flex min-w-0 max-w-[640px] flex-1">
          <label className="flex h-10 w-full items-center gap-2 rounded-full border border-[#303030] bg-[#1a1a1a] px-4 focus-within:border-[#3b82f6]/50">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="min-w-0 flex-1 bg-transparent text-sm text-[#f1f1f1] outline-none placeholder:text-[#717171]"
            />
            {search.length > 0 ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearch("")}
                className="shrink-0 rounded-full p-0.5 text-[#717171] transition-colors hover:text-[#f1f1f1]"
              >
                <X className="h-4 w-4" />
              </button>
            ) : (
              <Search className="h-[18px] w-[18px] shrink-0 text-[#717171]" strokeWidth={1.5} />
            )}
          </label>
        </div>
      ) : (
        <div className="flex-1" />
      )}
    </header>
  );
}
