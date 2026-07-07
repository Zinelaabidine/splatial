"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, MessageSquare, Plus, Search, X } from "lucide-react";
import { useCallback, useState } from "react";

import {
  ADMIN_NAV_ITEM,
  APP_NAV,
  SECTION_LABELS,
  type NavItem,
} from "@/components/layout/appNavConfig";
import { useAppShell } from "@/components/layout/AppShellContext";
import NotificationBell from "@/components/layout/NotificationBell";
import TrainingMenu from "@/components/layout/TrainingMenu";
import ActivityMenu from "@/components/layout/ActivityMenu";
import SettingsPanel from "@/components/layout/panels/SettingsPanel";
import SplatworksLogo from "@/components/splatworks/SplatworksLogo";
import { useIsAdmin } from "@/lib/auth/useIsAdmin";
import { cn } from "@/lib/utils";

const iconButtonClass =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#e8e8ec] transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25";

function NavLink({
  item,
  pathname,
  onNavigate,
  className,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
  className?: string;
}) {
  const { label, href, icon: Icon, match } = item;
  const isActive = match(pathname);

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "sw-top-nav-link flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] transition-colors",
        isActive
          ? "sw-top-nav-active font-semibold text-white"
          : "font-medium text-[#a8a8b2] hover:bg-white/[0.06] hover:text-[#e4e4e8]",
        className,
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "h-4 w-4 shrink-0",
          isActive ? "text-[#19c2ad]" : "text-[#8a8a94]",
        )}
        strokeWidth={isActive ? 2.25 : 1.75}
      />
      <span>{label}</span>
    </Link>
  );
}

export default function AppTopBar() {
  const {
    search,
    setSearch,
    searchPlaceholder,
    showSearch,
    isViewerPage,
    commentsOverlayOpen,
    toggleCommentsOverlay,
    viewerCommentsCount,
    commentsTriggerRef,
  } = useAppShell();
  const pathname = usePathname();
  const router = useRouter();
  const isAdmin = useIsAdmin();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const navItems: NavItem[] = isAdmin ? [...APP_NAV, ADMIN_NAV_ITEM] : APP_NAV;
  const section = SECTION_LABELS.find((s) => s.match(pathname))?.label;

  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

  return (
    <header className="sw-glass-bar sticky top-0 z-50 w-screen shrink-0">
      <div className="relative grid h-[3.25rem] grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-5">
        {/* Left — logo + breadcrumb */}
        <div className="flex min-w-0 items-center gap-2 justify-self-start">
          <button
            type="button"
            aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen((open) => !open)}
            className={cn(iconButtonClass, "lg:hidden", mobileNavOpen && "bg-white/10")}
          >
            {mobileNavOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>

          <Link
            href="/scenes"
            className="hidden shrink-0 sm:block"
            aria-label="Splatworks home"
          >
            <SplatworksLogo variant="dark" />
          </Link>

          {section ? (
            <span className="hidden min-w-0 items-center gap-1.5 truncate text-[13px] md:flex">
              <span className="font-medium text-[#9a9aa4]">Splatworks</span>
              <span className="text-[#5a5a64]">/</span>
              <span className="truncate font-semibold text-white">{section}</span>
            </span>
          ) : null}
        </div>

        {/* Center — primary navigation */}
        <nav
          aria-label="Primary"
          className="hidden items-center gap-0.5 justify-self-center lg:flex"
        >
          {navItems.map((item) => (
            <NavLink key={item.id} item={item} pathname={pathname} />
          ))}
        </nav>

        {/* Right — CTA + utility icons */}
        <div className="flex items-center gap-1 justify-self-end sm:gap-1.5">
          <button
            type="button"
            onClick={() => router.push("/scenes/create")}
            className="sw-header-cta hidden h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold tracking-[-0.01em] transition-[background-color,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#19c2ad]/45 active:scale-[0.98] sm:flex"
          >
            <Plus className="h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden />
            <span>New Scene</span>
          </button>

          <button
            type="button"
            onClick={() => router.push("/scenes/create")}
            aria-label="New scene"
            className="sw-header-cta flex h-9 w-9 items-center justify-center rounded-full transition-[background-color,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#19c2ad]/45 active:scale-[0.98] sm:hidden"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          </button>

          {isViewerPage ? (
            <button
              ref={commentsTriggerRef}
              type="button"
              aria-label={commentsOverlayOpen ? "Close comments" : "Open comments"}
              aria-expanded={commentsOverlayOpen}
              onClick={toggleCommentsOverlay}
              className={cn(
                iconButtonClass,
                "relative",
                commentsOverlayOpen && "bg-white/10",
              )}
            >
              <MessageSquare className="h-[18px] w-[18px]" strokeWidth={1.75} />
              {viewerCommentsCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#19c2ad] px-1 text-[10px] font-semibold text-black">
                  {viewerCommentsCount > 99 ? "99+" : viewerCommentsCount}
                </span>
              ) : null}
            </button>
          ) : null}
          <TrainingMenu />
          <ActivityMenu />
          <NotificationBell />
          <SettingsPanel />
        </div>
      </div>

      {showSearch ? (
        <div className="border-t border-white/8 px-4 py-2.5 sm:px-5">
          <label
            className={cn(
              "sw-control mx-auto flex h-10 max-w-[720px] items-center gap-2.5 rounded-full px-4 transition-all",
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
      ) : null}

      {mobileNavOpen ? (
        <>
          <button
            type="button"
            aria-label="Close navigation"
            className="fixed inset-0 top-[3.25rem] z-40 bg-black/60 lg:hidden"
            onClick={closeMobileNav}
          />
          <nav
            aria-label="Primary"
            className="sw-overlay-panel absolute inset-x-0 top-full z-50 flex flex-col gap-1 border-x-0 border-t border-b-0 p-3 lg:hidden"
          >
            {navItems.map((item) => (
              <NavLink
                key={item.id}
                item={item}
                pathname={pathname}
                onNavigate={closeMobileNav}
                className="w-full px-3.5 py-2.5"
              />
            ))}
            <button
              type="button"
              onClick={() => {
                closeMobileNav();
                router.push("/scenes/create");
              }}
              className="sw-header-cta mt-1 flex h-10 w-full items-center justify-center gap-2 rounded-full text-[13px] font-semibold"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
              New Scene
            </button>
          </nav>
        </>
      ) : null}
    </header>
  );
}
