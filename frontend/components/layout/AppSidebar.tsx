"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bookmark,
  Box,
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

type NavId = "explore" | "feed" | "saved" | "home" | "splats" | "training" | "activity" | "admin";
type NavActionId = "training" | "activity";

type AppSidebarProps = {
  trainingCount?: number;
  collapsed?: boolean;
  onNavAction?: (id: NavActionId) => void;
};

const NAV: {
  id: NavId;
  label: string;
  href: string;
  icon: typeof Home;
  match: (path: string) => boolean;
}[] = [
  {
    id: "explore",
    label: "Explore",
    href: "/explore",
    icon: Compass,
    match: (p) => p === "/explore",
  },
  {
    id: "feed",
    label: "Feed",
    href: "/feed",
    icon: Rss,
    match: (p) => p === "/feed",
  },
  {
    id: "saved",
    label: "Saved",
    href: "/saved",
    icon: Bookmark,
    match: (p) => p === "/saved",
  },
  {
    id: "home",
    label: "Home",
    href: "/scenes",
    icon: Home,
    match: (p) => p === "/scenes" || p.startsWith("/scenes/create"),
  },
  {
    id: "splats",
    label: "My Splats",
    href: "/splats",
    icon: Box,
    match: (p) => p === "/splats" || p.startsWith("/scenes/view"),
  },
  {
    id: "training",
    label: "Training",
    href: "#",
    icon: TrendingUp,
    match: () => false,
  },
  {
    id: "activity",
    label: "Activity",
    href: "#",
    icon: Clock,
    match: () => false,
  },
];

const navItemClassName = (isActive: boolean) =>
  cn(
    "relative flex items-center gap-3 rounded-xl py-2.5 pr-3 text-sm transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-0",
    isActive ? "sw-nav-active pl-5 font-medium text-white" : "pl-3 font-normal text-[#a1a1aa] hover:bg-white/[0.06]",
  );

export default function AppSidebar({
  trainingCount = 0,
  collapsed = false,
  onNavAction,
}: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isAdmin = useIsAdmin();

  const navItems = isAdmin
    ? [
        ...NAV,
        {
          id: "admin" as const,
          label: "Admin",
          href: "/admin",
          icon: ShieldCheck,
          match: (p: string) => p === "/admin" || p.startsWith("/admin/"),
        },
      ]
    : NAV;

  return (
    <aside
      aria-label="Main navigation"
      className={cn(
        "sw-glass sw-glass-border relative z-10 my-3 ml-3 flex h-[calc(100%-1.5rem)] shrink-0 flex-col overflow-y-auto overflow-x-hidden rounded-2xl py-4 transition-[width] duration-200 ease-out",
        collapsed ? "w-[68px] px-2" : "w-[240px] px-3",
      )}
    >
      <SplatworksLogo
        variant="dark"
        compact={collapsed}
        className={cn("relative z-[1] mb-5", collapsed ? "px-0" : "px-1")}
      />

      <nav
        aria-label="Primary"
        className="relative z-[1] flex flex-col gap-0.5"
      >
        {navItems.map(({ id, label, href, icon: Icon, match }) => {
          const isActive = match(pathname);
          const showTrainingBadge = id === "training" && trainingCount > 0;

          const inner = (
            <>
              <Icon
                aria-hidden
                className={cn(
                  "h-5 w-5 shrink-0 transition-all duration-200",
                  isActive
                    ? "text-white"
                    : "text-[#84848c] group-hover:text-[#c5c5cb]",
                )}
                strokeWidth={isActive ? 2 : 1.5}
              />
              {!collapsed && (
                <span className="min-w-0 flex-1 truncate">{label}</span>
              )}
              {!collapsed && showTrainingBadge && (
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
              {collapsed && showTrainingBadge && (
                <span
                  className="sw-training-dot absolute right-1.5 top-1.5"
                  aria-hidden
                />
              )}
            </>
          );

          const className = cn(
            navItemClassName(isActive),
            "group",
            collapsed && "justify-center px-0",
          );

          if (href === "#") {
            const actionId = id as NavActionId;
            return (
              <button
                key={id}
                type="button"
                className={className}
                title={collapsed ? label : undefined}
                aria-label={showTrainingBadge ? `${label}, ${trainingCount} in progress` : label}
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
        })}
      </nav>

      <button
        type="button"
        onClick={() => router.push("/scenes/create")}
        title={collapsed ? "New scene" : undefined}
        aria-label="New scene"
        className={cn(
          "sw-new-scene relative z-[1] mt-5 flex h-10 items-center justify-center gap-2 rounded-full text-sm font-semibold text-white transition-[filter,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50 focus-visible:ring-offset-0",
          collapsed ? "w-10 self-center" : "w-full",
        )}
      >
        <Plus className="relative z-[1] h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
        {!collapsed && <span className="relative z-[1]">New scene</span>}
      </button>
    </aside>
  );
}
