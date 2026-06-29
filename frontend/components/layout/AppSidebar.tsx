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

  return (
    <aside className="sw-glass relative z-10 my-3 ml-3 flex h-[calc(100%-1.5rem)] w-[240px] shrink-0 flex-col overflow-y-auto rounded-2xl px-3 py-4">
      <SplatworksLogo variant="dark" className="mb-5 px-1" />

      <nav className="flex flex-col gap-0.5">
        {navItems.map(({ id, label, href, icon: Icon, match }) => {
          const isActive = match(pathname);
          const badge = id === "training" ? trainingCount : undefined;
          const inner = (
            <>
              <Icon
                className={cn(
                  "h-5 w-5 shrink-0 transition-all",
                  isActive &&
                    "[filter:drop-shadow(0_0_7px_rgba(129,140,248,0.85))]",
                )}
                strokeWidth={isActive ? 2 : 1.5}
                color={isActive ? "#a5b4fc" : "#aab4c8"}
              />
              <span className="flex-1 truncate">{label}</span>
              {badge != null && badge > 0 && (
                <span className="font-sw-mono rounded-md bg-indigo-500/25 px-1.5 py-px text-[10px] font-semibold text-indigo-200 ring-1 ring-indigo-400/30">
                  {badge}
                </span>
              )}
            </>
          );

          const className = cn(
            "flex items-center gap-4 rounded-xl px-3 py-2.5 text-sm transition-colors",
            isActive
              ? "sw-nav-active font-medium text-white"
              : "font-normal text-[#d2d8e6] hover:bg-white/10",
          );

          if (href === "#") {
            const actionId = id as NavActionId;
            return (
              <button
                key={id}
                type="button"
                className={className}
                onClick={() => onNavAction?.(actionId)}
              >
                {inner}
              </button>
            );
          }

          return (
            <Link key={id} href={href} className={className}>
              {inner}
            </Link>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={() => router.push("/scenes/create")}
        className="sw-new-scene mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold text-white transition-shadow"
      >
        <Plus className="h-4 w-4" strokeWidth={2} />
        New scene
      </button>

      <div className="sw-control mt-auto flex items-center gap-2.5 rounded-2xl px-2.5 py-2.5">
        <div className="rounded-full ring-1 ring-white/20 [box-shadow:0_0_14px_-2px_rgba(20,184,166,0.7)]">
          <UserAvatar initials={account.initials} size={36} />
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-semibold text-white">
            {account.name}
          </div>
          <div className="font-sw-mono text-[11px] text-[#9aa6bd]">
            {account.plan}
          </div>
        </div>
        <button
          type="button"
          aria-label="Settings"
          className="rounded-lg p-1.5 text-[#9aa6bd] transition-colors hover:bg-white/10 hover:text-white"
          onClick={() => onSettingsClick?.()}
        >
          <Settings className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>
    </aside>
  );
}
