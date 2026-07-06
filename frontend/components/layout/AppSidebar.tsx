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
  X,
} from "lucide-react";

import SplatworksLogo from "@/components/splatworks/SplatworksLogo";
import { useIsAdmin } from "@/lib/auth/useIsAdmin";
import { cn } from "@/lib/utils";

type NavId = "explore" | "feed" | "saved" | "home" | "splats" | "admin";

type AppSidebarProps = {
  collapsed?: boolean;
  onNavigate?: () => void;
  variant?: "default" | "overlay";
  onClose?: () => void;
};

type NavItem = {
  id: NavId;
  label: string;
  href: string;
  icon: typeof Home;
  match: (path: string) => boolean;
};

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
    "group relative flex items-center gap-3 py-2.5 text-sm transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-0",
    isActive
      ? "font-semibold text-white"
      : "font-medium text-[#a8a8b2] hover:bg-white/[0.05] hover:text-[#e4e4e8]",
    collapsed
      ? "justify-center rounded-xl px-0"
      : "rounded-l-none rounded-r-full pl-3.5 pr-4",
    isActive && "sw-nav-active",
  );

export default function AppSidebar({
  collapsed = false,
  onNavigate,
  variant = "default",
  onClose,
}: AppSidebarProps) {
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
            "h-[18px] w-[18px] shrink-0 transition-colors duration-200",
            isActive ? "text-white" : "text-[#8a8a94] group-hover:text-[#d0d0d8]",
          )}
          strokeWidth={isActive ? 2.25 : 1.75}
        />
        {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
      </Link>
    );
  };

  return (
    <aside
      aria-label="Main navigation"
      className={cn(
        "relative z-10 flex h-full shrink-0 flex-col overflow-y-auto overflow-x-hidden py-5 transition-[width] duration-200 ease-out",
        variant === "overlay"
          ? "w-full bg-transparent px-4"
          : cn(
              "sw-sidebar-panel",
              collapsed ? "w-[68px] px-2" : "w-[248px] pl-3",
            ),
      )}
    >
      <div
        className={cn(
          "relative z-[1] mb-5 flex items-center",
          collapsed ? "justify-center" : "justify-between gap-2 pr-1",
        )}
      >
        <SplatworksLogo
          variant="dark"
          compact={collapsed}
          className={cn(collapsed ? "px-0" : "px-1")}
        />
        {variant === "overlay" && onClose ? (
          <button
            type="button"
            data-overlay-focus
            aria-label="Close navigation"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#c8c8d0] transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {!collapsed && (
        <div className="relative z-[1] mb-4 mr-3 h-px bg-white/8" aria-hidden />
      )}

      <button
        type="button"
        onClick={() => router.push("/scenes/create")}
        title={collapsed ? "New scene" : undefined}
        aria-label="New scene"
        className={cn(
          "sw-new-scene relative z-[1] mb-5 flex h-10 items-center justify-center gap-2 rounded-full text-[13px] font-semibold tracking-[-0.01em] transition-[filter,box-shadow,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#19c2ad]/45 focus-visible:ring-offset-0 active:scale-[0.98]",
          collapsed ? "w-10 self-center" : "w-full mr-3",
        )}
      >
        <Plus className="relative z-[1] h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden />
        {!collapsed && <span className="relative z-[1]">New scene</span>}
      </button>

      <nav aria-label="Primary" className="relative z-[1] flex flex-col gap-1">
        {navItems.map(renderItem)}
      </nav>
    </aside>
  );
}
