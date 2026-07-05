"use client";

import { usePathname } from "next/navigation";
import { Menu, Search, X } from "lucide-react";

import { useAppShell } from "@/components/layout/AppShellContext";
import { useAppAccount } from "@/hooks/layout/useAppAccount";
import { UserAvatar } from "@/components/splatworks/SplatworksLogo";
import NotificationBell from "@/components/layout/NotificationBell";

type AppTopBarProps = {
  onMenuClick?: () => void;
  onAccountClick?: () => void;
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

export default function AppTopBar({ onMenuClick, onAccountClick }: AppTopBarProps) {
  const { search, setSearch, searchPlaceholder, showSearch } = useAppShell();
  const pathname = usePathname();
  const account = useAppAccount();
  const section = SECTION_LABELS.find((s) => s.match(pathname))?.label;

  return (
    <header className="sw-glass-bar sticky top-0 z-50 flex h-14 shrink-0 items-center gap-3 px-4">
      <button
        type="button"
        aria-label="Toggle navigation"
        onClick={onMenuClick}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#f1f1f1] hover:bg-white/10"
      >
        <Menu className="h-5 w-5" />
      </button>

      {section ? (
        <span className="hidden shrink-0 items-center gap-1.5 text-[13px] text-[#84848c] md:flex">
          Splatworks
          <span className="text-[#4a4a52]">/</span>
          <span className="text-[#e4e4e7]">{section}</span>
        </span>
      ) : null}

      {showSearch ? (
        <div className="mx-auto flex min-w-0 max-w-[640px] flex-1">
          <label className="sw-control flex h-10 w-full items-center gap-2 rounded-full px-4 transition-colors focus-within:border-white/30 focus-within:bg-white/10">
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

      <NotificationBell />

      <button
        type="button"
        aria-label="Account settings"
        onClick={onAccountClick}
        className="shrink-0 rounded-full transition-opacity hover:opacity-80"
      >
        <UserAvatar initials={account.initials} size={30} />
      </button>
    </header>
  );
}
