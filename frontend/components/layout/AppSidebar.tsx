"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bookmark,
  Box,
  Compass,
  Home,
  Plus,
  Rss,
  ShieldCheck,
} from "lucide-react";

import SplatworksLogo from "@/components/splatworks/SplatworksLogo";
import { useIsAdmin } from "@/lib/auth/useIsAdmin";
import { cn } from "@/lib/utils";

type NavId = "explore" | "feed" | "saved" | "home" | "splats" | "admin";

type AppSidebarProps = {
  collapsed?: boolean;
  onNavigate?: () => void;
};

type NavItem = {
  id: NavId;
  label: string;
  href: string;
  icon: typeof Home;
  match: (path: string) => boolean;
};

// Training and Activity live in the top bar now (next to notifications and
// the account menu) as their own popovers — this list is just destinations.
const NAV: NavItem[] = [
  {
    id: "home",
    label: "Home",
    href: "/scenes",
    icon: Home,
    match: (p) => p === "/scenes" || p.startsWith("/scenes/create"),
  },
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
    id: "splats",
    label: "My Splats",
    href: "/splats",
    icon: Box,
    match: (p) => p === "/splats" || p.startsWith("/scenes/view"),
  },
  {
    id: "saved",
    label: "Saved",
    href: "/saved",
    icon: Bookmark,
    match: (p) => p === "/saved",
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

export default function AppSidebar({ collapsed = false, onNavigate }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isAdmin = useIsAdmin();

  const navItems: NavItem[] = isAdmin
    ? [
        ...NAV,
        {
          id: "admin",
          label: "Admin",
          href: "/admin",
          icon: ShieldCheck,
          match: (p: string) => p === "/admin" || p.startsWith("/admin/"),
        },
      ]
    : NAV;

  const renderItem = (item: NavItem) => {
    const { id, label, href, icon: Icon, match } = item;
    const isActive = match(pathname);

    return (
      <Link
        key={id}
        href={href}
        className={navRowClassName(isActive, collapsed)}
        title={collapsed ? label : undefined}
        aria-current={isActive ? "page" : undefined}
        onClick={onNavigate}
      >
        <Icon
          aria-hidden
          className={cn(
            "h-5 w-5 shrink-0 transition-all duration-200",
            isActive ? "text-white" : "text-[#84848c] group-hover:text-[#c5c5cb]",
          )}
          strokeWidth={isActive ? 2 : 1.5}
        />
        {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
      </Link>
    );
  };

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
        {navItems.map(renderItem)}
      </nav>
    </aside>
  );
}
