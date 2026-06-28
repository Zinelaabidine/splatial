"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthenticator } from "@aws-amplify/ui-react";
import {
  ChevronDown,
  Clapperboard,
  Download,
  Layers,
  Plus,
  Search,
  Settings,
  Shield,
  SlidersHorizontal,
  User,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { AppMode } from "@/types/dashboard";

type TopNavBarProps = {
  mode: AppMode;
  /** Called when the + Create nav item is clicked (dashboard mode only). */
  onCreateClick?: () => void;
  /** Called when Library is clicked; overrides default router.push if provided. */
  onLibraryClick?: () => void;
  /** Called when Admin Console is clicked. */
  onAdminClick?: () => void;
  /** Called when My Profile is clicked from the user dropdown. */
  onProfileClick?: () => void;
};

const NAV_LINK_CLASS =
  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900";

/** Derive display name and 2-letter initials from a Cognito email / username. */
function parseUser(loginId: string): { displayName: string; initials: string } {
  const local = loginId.split("@")[0] ?? loginId;
  const parts = local.split(/[._-]/).filter(Boolean);
  const displayName =
    parts.length >= 2
      ? `${parts[0][0].toUpperCase()}${parts[0].slice(1)} ${parts[parts.length - 1][0].toUpperCase()}${parts[parts.length - 1].slice(1)}`
      : local.charAt(0).toUpperCase() + local.slice(1);
  const initials = parts
    .map((p) => p[0].toUpperCase())
    .slice(0, 2)
    .join("");
  return { displayName, initials: initials || "?" };
}

export default function TopNavBar({
  mode,
  onCreateClick,
  onLibraryClick,
  onAdminClick,
  onProfileClick,
}: TopNavBarProps) {
  const router = useRouter();
  const { user, signOut } = useAuthenticator((ctx) => [ctx.user, ctx.signOut]);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const email =
    (user?.signInDetails?.loginId as string | undefined) ??
    user?.username ??
    "";
  const { displayName, initials } = parseUser(email);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-50 flex h-16 shrink-0 items-center gap-4 border-b border-gray-200 bg-white px-5">
      {/* Brand */}
      <div className="flex shrink-0 items-center gap-2.5">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-purple-600 text-sm font-bold text-white">
          3
        </div>
        <span className="text-base font-bold tracking-tight text-gray-900">Splatal</span>
      </div>

      {/* Search */}
      <div className="relative hidden min-w-0 flex-1 sm:block sm:max-w-xs lg:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          placeholder="Search"
          className="h-9 w-full rounded-full border border-gray-200 bg-gray-50 pl-9 pr-4 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-purple-300 focus:bg-white focus:ring-2 focus:ring-purple-100"
        />
      </div>

      <div className="ml-auto flex items-center gap-1">
        {/* Main navigation */}
        <nav className="flex items-center gap-0.5" aria-label="Main navigation">
          <button
            type="button"
            onClick={() =>
              onLibraryClick ? onLibraryClick() : router.push("/scenes")
            }
            className={cn(
              NAV_LINK_CLASS,
              mode === "dashboard" && "bg-purple-50 text-purple-600",
            )}
          >
            <Layers className="h-4 w-4" />
            Library
          </button>
          <button
            type="button"
            onClick={onCreateClick}
            className={NAV_LINK_CLASS}
          >
            <Plus className="h-4 w-4" />
            Create
          </button>
          <button
            type="button"
            onClick={onAdminClick}
            className={cn(
              NAV_LINK_CLASS,
              mode === "admin" && "bg-purple-50 text-purple-600",
            )}
          >
            <Shield className="h-4 w-4" />
            Admin Console
          </button>
          <button type="button" className={NAV_LINK_CLASS}>
            <Settings className="h-4 w-4" />
            Settings
          </button>
        </nav>

        {/* Viewer-only scene actions */}
        {mode === "viewer" && (
          <nav
            className="ml-3 flex items-center gap-0.5 border-l border-gray-200 pl-3"
            aria-label="Scene actions"
          >
            <button type="button" className={NAV_LINK_CLASS}>
              <Clapperboard className="h-4 w-4" />
              Record Animation
            </button>
            <button type="button" className={NAV_LINK_CLASS}>
              <Download className="h-4 w-4" />
              Export to MP4
            </button>
          </nav>
        )}

        {/* User profile dropdown */}
        <div ref={menuRef} className="relative ml-3 border-l border-gray-200 pl-3">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-gray-50"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <div className="grid h-9 w-9 place-items-center rounded-full bg-purple-100 text-sm font-semibold text-purple-700">
              {initials}
            </div>
            <div className="hidden text-left lg:block">
              <p className="text-sm font-medium leading-tight text-gray-900">
                {displayName}
              </p>
              <p className="text-xs leading-tight text-gray-500">{email}</p>
            </div>
            <ChevronDown
              className={cn(
                "hidden h-4 w-4 text-gray-400 transition-transform lg:block",
                menuOpen && "rotate-180",
              )}
            />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-1 min-w-[168px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onProfileClick?.();
                }}
                className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
              >
                <User className="h-4 w-4 text-gray-400" />
                My Profile
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
              >
                <SlidersHorizontal className="h-4 w-4 text-gray-400" />
                Preferences
              </button>
              <div className="my-1 border-t border-gray-100" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  signOut();
                }}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
