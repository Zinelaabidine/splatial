"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, MessageSquare, Plus, Search, X } from "lucide-react";
import { useCallback, useState } from "react";

import {
  ADMIN_NAV_ITEM,
  TOP_BAR_NAV,
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
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--nav-slate)] transition-colors hover:bg-[var(--nav-teal-tint)] hover:text-[var(--nav-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nav-teal)]/40";

const TOP_NAV_ITEM_CLASS =
  "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-medium leading-none whitespace-nowrap transition-colors";

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
        TOP_NAV_ITEM_CLASS,
        isActive
          ? "bg-[var(--nav-pine-tint)] font-semibold text-[var(--nav-pine)] shadow-[inset_0_0_0_1px_rgba(35,67,58,0.10)]"
          : "text-[var(--nav-slate)] hover:bg-[var(--nav-teal-tint)] hover:text-[var(--nav-ink)]",
        className,
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "h-4 w-4 shrink-0",
          isActive ? "text-[var(--nav-pine)]" : "text-[var(--nav-slate-soft)]",
        )}
        strokeWidth={isActive ? 2.25 : 1.75}
      />
      <span>{label}</span>
    </Link>
  );
}

function TopBarSearch({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex h-9 w-full items-center gap-2.5 rounded-lg border border-[var(--nav-hairline)] bg-[var(--nav-icon-surface)] px-3 transition-colors",
        "focus-within:border-[var(--nav-teal)] focus-within:ring-1 focus-within:ring-[var(--nav-teal)]/40",
        className,
      )}
    >
      <Search
        className="h-4 w-4 shrink-0 text-[var(--nav-slate-soft)]"
        strokeWidth={1.75}
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm text-[var(--nav-ink)] outline-none placeholder:text-[var(--nav-slate-soft)]"
      />
      {value.length > 0 ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="shrink-0 rounded-full p-0.5 text-[var(--nav-slate-soft)] transition-colors hover:bg-[var(--nav-teal-tint)] hover:text-[var(--nav-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nav-teal)]/40"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </label>
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

  const navItems: NavItem[] = isAdmin
    ? [...TOP_BAR_NAV, ADMIN_NAV_ITEM]
    : TOP_BAR_NAV;

  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

  return (
    <header className="sticky top-0 z-50 h-16 w-full shrink-0 border-b border-[var(--nav-hairline)] bg-[var(--nav-surface)]">
      <div className="relative flex h-full items-center gap-3 px-4 sm:gap-4 sm:px-5">
        {/* Left — brand */}
        <div className="flex min-w-0 flex-1 items-center gap-3 lg:gap-5">
          <button
            type="button"
            aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen((open) => !open)}
            className={cn(iconButtonClass, "lg:hidden", mobileNavOpen && "bg-[var(--nav-pine-tint)] text-[var(--nav-ink)]")}
          >
            {mobileNavOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>

          <Link href="/scenes" className="shrink-0" aria-label="Splatworks home">
            <SplatworksLogo variant="light" />
          </Link>
        </div>

        {/* Center — primary navigation */}
        <nav
          aria-label="Primary"
          className="pointer-events-none absolute left-1/2 hidden -translate-x-1/2 items-center gap-0.5 lg:pointer-events-auto lg:flex"
        >
          {navItems.map((item) => (
            <NavLink key={item.id} item={item} pathname={pathname} />
          ))}
        </nav>

        {/* Right — search, CTA, utilities, account */}
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1 sm:gap-1.5">
          {showSearch ? (
            <TopBarSearch
              value={search}
              onChange={setSearch}
              placeholder={searchPlaceholder || "Search"}
              className="hidden h-8 w-28 sm:flex sm:w-36 md:w-40"
            />
          ) : null}

          <Link
            href="/scenes/create"
            className={cn(
              TOP_NAV_ITEM_CLASS,
              "hidden bg-[var(--nav-pine)] text-[var(--nav-cta-fg)] shadow-[0_1px_2px_rgba(35,67,58,0.25),0_6px_14px_rgba(35,67,58,0.14)] hover:bg-[var(--nav-pine-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nav-pine)]/40 sm:inline-flex",
            )}
          >
            <Plus
              className="h-4 w-4 shrink-0 text-[var(--nav-cta-fg)]"
              strokeWidth={2}
              aria-hidden
            />
            <span>New Scene</span>
          </Link>

          <button
            type="button"
            onClick={() => router.push("/scenes/create")}
            aria-label="New scene"
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--nav-pine)] text-[var(--nav-cta-fg)] transition-colors hover:bg-[var(--nav-pine-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nav-pine)]/40 active:scale-[0.98] sm:hidden"
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
                commentsOverlayOpen && "bg-[var(--nav-pine-tint)] text-[var(--nav-ink)]",
              )}
            >
              <MessageSquare className="h-[18px] w-[18px]" strokeWidth={1.75} />
              {viewerCommentsCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--nav-pine)] px-1 text-[10px] font-semibold text-[var(--nav-cta-fg)]">
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

      {mobileNavOpen ? (
        <>
          <button
            type="button"
            aria-label="Close navigation"
            className="fixed inset-0 top-16 z-40 bg-[var(--nord-scrim)] lg:hidden"
            onClick={closeMobileNav}
          />
          <nav
            aria-label="Primary"
            className="absolute inset-x-0 top-full z-50 flex flex-col gap-1 border-b border-[var(--nav-hairline)] bg-[var(--nav-surface)] p-3 lg:hidden"
          >
            {showSearch ? (
              <TopBarSearch
                value={search}
                onChange={setSearch}
                placeholder={searchPlaceholder || "Search"}
                className="mb-1 sm:hidden"
              />
            ) : null}
            {navItems.map((item) => (
              <NavLink
                key={item.id}
                item={item}
                pathname={pathname}
                onNavigate={closeMobileNav}
                className="w-full px-3.5 py-2.5"
              />
            ))}
            <Link
              href="/scenes/create"
              onClick={closeMobileNav}
              className={cn(
                TOP_NAV_ITEM_CLASS,
                "w-full bg-[var(--nav-pine)] px-3.5 py-2.5 text-[var(--nav-cta-fg)] hover:bg-[var(--nav-pine-hover)]",
              )}
            >
              <Plus
                className="h-4 w-4 shrink-0 text-[var(--nav-cta-fg)]"
                strokeWidth={2}
                aria-hidden
              />
              <span>New Scene</span>
            </Link>
          </nav>
        </>
      ) : null}
    </header>
  );
}
