"use client";

import { usePathname } from "next/navigation";
import { Menu, Search, X } from "lucide-react";

import { useAppShell } from "@/components/layout/AppShellContext";
import NotificationBell from "@/components/layout/NotificationBell";
import TrainingMenu from "@/components/layout/TrainingMenu";
import ActivityMenu from "@/components/layout/ActivityMenu";
import SettingsPanel from "@/components/layout/panels/SettingsPanel";
import { cn } from "@/lib/utils";

type AppTopBarProps = {
  onMenuClick?: () => void;
};

const SECTION_LABELS: { match: (p: string) => boolean; label: string }[] = [
  { match: (p) => p === "/scenes" || p.startsWith("/scenes/create"), label: "Scenes" },
  { match: (p) => p.startsWith("/scenes/view"), label: "Viewer" },
  { match: (p) => p === "/splats", label: "My Splats" },
  { match: (p) => p === "/explore", label: "Explore" },
  { match: (p) => p === "/feed", label: "Feed" },
  { match: (p) => p === "/saved", label: "Saved" },
  { match: (p) => p.startsWith("/admin"), label: "Admin" },
  { match: (p) => p.startsWith("/settings"), label: "Settings" },
];

const iconButtonClass =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#e8e8ec] transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25";

export default function AppTopBar({ onMenuClick }: AppTopBarProps) {
  const { search, setSearch, searchPlaceholder, showSearch } = useAppShell();
  const pathname = usePathname();
  const section = SECTION_LABELS.find((s) => s.match(pathname))?.label;

  return (
    <header className="sw-glass-bar sticky top-0 z-50 flex h-[3.25rem] shrink-0 items-center gap-3 px-4 sm:px-5">
      <button
        type="button"
        aria-label="Toggle navigation"
        onClick={onMenuClick}
        className={iconButtonClass}
      >
        <Menu className="h-5 w-5" />
      </button>

      {section ? (
        <span className="hidden shrink-0 items-center gap-1.5 text-[13px] md:flex">
          <span className="font-medium text-[#9a9aa4]">Splatworks</span>
          <span className="text-[#5a5a64]">/</span>
          <span className="font-semibold text-white">{section}</span>
        </span>
      ) : null}

      {showSearch ? (
        <div className="mx-auto flex min-w-0 max-w-[560px] flex-1 sm:max-w-[640px]">
          <label
            className={cn(
              "sw-control flex h-10 w-full items-center gap-2.5 rounded-full px-4 transition-all",
              "focus-within:border-white/22 focus-within:bg-white/[0.07] focus-within:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]",
            )}
          >
            <Search
              className="h-[17px] w-[17px] shrink-0 text-[#8a8a94]"
              strokeWidth={1.75}
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-[#8a8a94]"
            />
            {search.length > 0 ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearch("")}
                className="shrink-0 rounded-full p-0.5 text-[#8a8a94] transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </label>
        </div>
      ) : (
        <div className="flex-1" />
      )}

      <div className="flex items-center gap-0.5 sm:gap-1">
        <TrainingMenu />
        <ActivityMenu />
        <NotificationBell />
        <SettingsPanel />
      </div>
    </header>
  );
}
