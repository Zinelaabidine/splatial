"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Bookmark,
  Box,
  ChevronDown,
  Clock,
  Compass,
  Home,
  Plus,
  Rss,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

import SplatworksLogo from "@/components/splatworks/SplatworksLogo";
import { useIsAdmin } from "@/lib/auth/useIsAdmin";
import { cn } from "@/lib/utils";

type NavId =
  | "explore"
  | "feed"
  | "saved"
  | "home"
  | "splats"
  | "training"
  | "activity"
  | "admin";
type NavActionId = "training" | "activity";
type NavGroup = "primary" | "secondary";

type AppSidebarProps = {
  trainingCount?: number;
  collapsed?: boolean;
  onNavAction?: (id: NavActionId) => void;
};

type NavItem = {
  id: NavId;
  label: string;
  href: string;
  icon: typeof Home;
  group: NavGroup;
  match: (path: string) => boolean;
};

// Primary — the day-to-day workflow. Kept flat, always visible.
// Secondary — lower-frequency destinations, tucked under a collapsible
// "More" disclosure (Gmail's "Labels"/"More" pattern) to keep the
// primary list dense and scannable.
const NAV: NavItem[] = [
  {
    id: "home",
    label: "Home",
    href: "/scenes",
    icon: Home,
    group: "primary",
    match: (p) => p === "/scenes" || p.startsWith("/scenes/create"),
  },
  {
    id: "explore",
    label: "Explore",
    href: "/explore",
    icon: Compass,
    group: "primary",
    match: (p) => p === "/explore",
  },
  {
    id: "feed",
    label: "Feed",
    href: "/feed",
    icon: Rss,
    group: "primary",
    match: (p) => p === "/feed",
  },
  {
    id: "splats",
    label: "My Splats",
    href: "/splats",
    icon: Box,
    group: "primary",
    match: (p) => p === "/splats" || p.startsWith("/scenes/view"),
  },
  {
    id: "saved",
    label: "Saved",
    href: "/saved",
    icon: Bookmark,
    group: "secondary",
    match: (p) => p === "/saved",
  },
  {
    id: "training",
    label: "Training",
    href: "#",
    icon: TrendingUp,
    group: "secondary",
    match: () => false,
  },
  {
    id: "activity",
    label: "Activity",
    href: "#",
    icon: Clock,
    group: "secondary",
    match: () => false,
  },
];

const navRowClassName = (isActive: boolean, collapsed: boolean) =>
  cn(
    "group relative flex items-center gap-3 py-2 text-sm transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-0",
    isActive ? "font-semibold text-white" : "font-normal text-[#a1a1aa] hover:bg-white/[0.06]",
    collapsed
      ? "justify-center rounded-xl px-0"
      : // Square on the left, rounded where the fill meets the sidebar's
        // right inner edge — the flush "selected tab" look, not a floating pill.
        "rounded-l-none rounded-r-full pl-3 pr-4",
    isActive && "sw-nav-active",
  );

function NavBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="sw-nav-badge shrink-0" aria-hidden>
      {count > 99 ? "99+" : count}
    </span>
  );
}

export default function AppSidebar({
  trainingCount = 0,
  collapsed = false,
  onNavAction,
}: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isAdmin = useIsAdmin();
  const [moreOpen, setMoreOpen] = useState(true);

  const secondaryExtra: NavItem[] = isAdmin
    ? [
        {
          id: "admin",
          label: "Admin",
          href: "/admin",
          icon: ShieldCheck,
          group: "secondary",
          match: (p: string) => p === "/admin" || p.startsWith("/admin/"),
        },
      ]
    : [];

  const primaryItems = NAV.filter((item) => item.group === "primary");
  const secondaryItems = [
    ...NAV.filter((item) => item.group === "secondary"),
    ...secondaryExtra,
  ];

  // Live counters only — no invented numbers. Training is the one nav
  // destination backed by real, ambient data (jobs in flight); wire more
  // items here as real counts (e.g. unread activity) become available.
  const badgeFor = (id: NavId): number => (id === "training" ? trainingCount : 0);

  const renderItem = (item: NavItem) => {
    const { id, label, href, icon: Icon, match } = item;
    const isActive = match(pathname);
    const badgeCount = badgeFor(id);
    const hasBadge = badgeCount > 0;
    const isTrainingLive = id === "training" && hasBadge;

    const inner = (
      <>
        <Icon
          aria-hidden
          className={cn(
            "h-5 w-5 shrink-0 transition-all duration-200",
            isActive ? "text-white" : "text-[#84848c] group-hover:text-[#c5c5cb]",
          )}
          strokeWidth={isActive ? 2 : 1.5}
        />
        {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
        {!collapsed && isTrainingLive && (
          <span
            className="sw-training-badge shrink-0"
            aria-label={`${trainingCount} training ${trainingCount === 1 ? "job" : "jobs"} in progress`}
          >
            <span className="sw-training-dot" aria-hidden />
            <span className="font-sw-mono text-[10px] font-medium tabular-nums text-amber-100/90">
              {trainingCount}
            </span>
          </span>
        )}
        {!collapsed && !isTrainingLive && hasBadge && <NavBadge count={badgeCount} />}
        {collapsed && hasBadge && (
          <span
            className={cn(
              "absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full",
              isTrainingLive ? "sw-training-dot" : "bg-[#3b82f6]",
            )}
            aria-hidden
          />
        )}
      </>
    );

    const className = navRowClassName(isActive, collapsed);

    if (href === "#") {
      const actionId = id as NavActionId;
      return (
        <button
          key={id}
          type="button"
          className={className}
          title={collapsed ? label : undefined}
          aria-label={hasBadge ? `${label}, ${badgeCount} in progress` : label}
          onClick={() => onNavAction?.(actionId)}
        >
          {inner}
        </button>
      );
    }

    return (
      <Link
        key={id}
        href={href}
        className={className}
        title={collapsed ? label : undefined}
        aria-current={isActive ? "page" : undefined}
      >
        {inner}
      </Link>
    );
  };

  const secondaryHasActive = secondaryItems.some((item) => item.match(pathname));

  return (
    <aside
      aria-label="Main navigation"
      className={cn(
        "sw-sidebar-panel relative z-10 flex h-full shrink-0 flex-col overflow-y-auto overflow-x-hidden py-4 transition-[width] duration-200 ease-out",
        collapsed ? "w-[68px] px-2" : "w-[240px] pl-3",
      )}
    >
      <SplatworksLogo
        variant="dark"
        compact={collapsed}
        className={cn("relative z-[1] mb-4", collapsed ? "px-0" : "px-1 pr-3")}
      />

      {/* Primary CTA — pinned to the top, "Compose" style: high-contrast,
          pill-shaped, with a lifted shadow so it reads as the one action
          that matters most. */}
      <button
        type="button"
        onClick={() => router.push("/scenes/create")}
        title={collapsed ? "New scene" : undefined}
        aria-label="New scene"
        className={cn(
          "sw-new-scene relative z-[1] mb-4 flex h-11 items-center justify-center gap-2 rounded-full text-sm font-semibold text-white transition-[filter,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50 focus-visible:ring-offset-0",
          collapsed ? "w-11 self-center" : "w-full mr-3",
        )}
      >
        <Plus className="relative z-[1] h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden />
        {!collapsed && <span className="relative z-[1]">New scene</span>}
      </button>

      <nav aria-label="Primary" className="relative z-[1] flex flex-col gap-0.5">
        {primaryItems.map(renderItem)}
      </nav>

      <div className={cn("relative z-[1] mt-3 border-t border-white/[0.06]", collapsed ? "" : "mr-3")} />

      {collapsed ? (
        <nav aria-label="More" className="relative z-[1] mt-3 flex flex-col gap-0.5">
          {secondaryItems.map(renderItem)}
        </nav>
      ) : (
        <div className="relative z-[1] mt-1 flex flex-col">
          <button
            type="button"
            onClick={() => setMoreOpen((open) => !open)}
            aria-expanded={moreOpen}
            className="mr-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium uppercase tracking-wide text-[#71717a] transition-colors hover:bg-white/[0.06] hover:text-[#c5c5cb]"
          >
            <span className="flex-1 text-left">More</span>
            {secondaryHasActive && !moreOpen && (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#3b82f6]" aria-hidden />
            )}
            <ChevronDown
              className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-150", moreOpen ? "rotate-0" : "-rotate-90")}
              strokeWidth={2}
              aria-hidden
            />
          </button>
          {moreOpen && (
            <nav aria-label="More" className="mt-0.5 flex flex-col gap-0.5">
              {secondaryItems.map(renderItem)}
            </nav>
          )}
        </div>
      )}
    </aside>
  );
}
