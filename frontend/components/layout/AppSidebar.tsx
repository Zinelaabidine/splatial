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
  Settings,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

import SplatworksLogo from "@/components/splatworks/SplatworksLogo";
import { UserAvatar } from "@/components/splatworks/SplatworksLogo";
import { useAppAccount } from "@/hooks/layout/useAppAccount";
import { useIsAdmin } from "@/lib/auth/useIsAdmin";
import { cn } from "@/lib/utils";

type NavId = "explore" | "feed" | "saved" | "home" | "splats" | "training" | "activity" | "admin";
type NavActionId = "training" | "activity";

type AppSidebarProps = {
  trainingCount?: number;
  onNavAction?: (id: NavActionId) => void;
  onSettingsClick?: () => void;
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
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/45 focus-visible:ring-offset-0",
    isActive ? "sw-nav-active pl-5 font-medium text-white" : "pl-3 font-normal text-[#d2d8e6] hover:bg-white/10",
  );

export default function AppSidebar({
  trainingCount = 0,
  onNavAction,
  onSettingsClick,
}: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const account = useAppAccount();
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

  const hasTrainingActivity = trainingCount > 0;

  return (
    <aside
      aria-label="Main navigation"
      className="sw-glass sw-glass-border relative z-10 my-3 ml-3 flex h-[calc(100%-1.5rem)] w-[240px] shrink-0 flex-col overflow-y-auto rounded-2xl px-3 py-4"
    >
      <SplatworksLogo variant="dark" className="relative z-[1] mb-5 px-1" />

      <nav aria-label="Primary" className="relative z-[1] flex flex-col gap-0.5">
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
                    ? "sw-icon-glow text-indigo-300"
                    : "text-[#aab4c8] group-hover:text-[#c5cde0]",
                )}
                strokeWidth={isActive ? 2 : 1.5}
              />
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {showTrainingBadge && (
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
            </>
          );

          const className = cn(navItemClassName(isActive), "group");

          if (href === "#") {
            const actionId = id as NavActionId;
            return (
              <button
                key={id}
                type="button"
                className={className}
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
        className="sw-new-scene relative z-[1] mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold text-white transition-[filter,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50 focus-visible:ring-offset-0"
      >
        <Plus className="relative z-[1] h-4 w-4" strokeWidth={2} aria-hidden />
        <span className="relative z-[1]">New scene</span>
      </button>

      <div
        className={cn(
          "sw-control sw-profile-card relative z-[1] mt-auto flex items-center gap-2.5 rounded-2xl px-2.5 py-2.5",
          hasTrainingActivity && "sw-profile-attention",
        )}
      >
        <div className="sw-profile-avatar-ring shrink-0">
          <UserAvatar initials={account.initials} size={36} />
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-semibold text-white">{account.name}</div>
          <div className="font-sw-mono truncate text-[11px] text-[#9aa6bd]">{account.plan}</div>
        </div>
        <button
          type="button"
          aria-label="Settings"
          className="shrink-0 rounded-lg p-1.5 text-[#9aa6bd] transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/45"
          onClick={() => onSettingsClick?.()}
        >
          <Settings className="h-4 w-4" strokeWidth={1.5} aria-hidden />
        </button>
      </div>
    </aside>
  );
}
