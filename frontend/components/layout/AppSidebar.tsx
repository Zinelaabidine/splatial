"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Box,
  Clock,
  Home,
  Plus,
  Settings,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

import SplatworksLogo from "@/components/splatworks/SplatworksLogo";
import { UserAvatar } from "@/components/splatworks/SplatworksLogo";
import { useAppAccount } from "@/hooks/layout/useAppAccount";
import { useIsAdmin } from "@/lib/auth/useIsAdmin";
import { cn } from "@/lib/utils";

type NavId = "home" | "splats" | "training" | "activity" | "admin";

const NAV: {
  id: NavId;
  label: string;
  href: string;
  icon: typeof Home;
  match: (path: string) => boolean;
  badge?: number;
}[] = [
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
    badge: 2,
  },
  {
    id: "activity",
    label: "Activity",
    href: "#",
    icon: Clock,
    match: () => false,
  },
];

export default function AppSidebar() {
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
    <aside className="flex h-full w-[240px] shrink-0 flex-col overflow-y-auto border-r border-[#303030] bg-[#0f0f0f] px-3 py-4">
      <SplatworksLogo variant="dark" className="mb-5 px-1" />

      <nav className="flex flex-col gap-0.5">
        {navItems.map(({ id, label, href, icon: Icon, match, badge }) => {
          const isActive = match(pathname);
          const inner = (
            <>
              <Icon
                className="h-5 w-5 shrink-0"
                strokeWidth={isActive ? 2 : 1.5}
                color={isActive ? "#3b82f6" : "#909090"}
              />
              <span className="flex-1 truncate">{label}</span>
              {badge != null && badge > 0 && (
                <span className="font-sw-mono rounded-md bg-[#1e3a5f] px-1.5 py-px text-[10px] font-semibold text-[#60a5fa]">
                  {badge}
                </span>
              )}
            </>
          );

          const className = cn(
            "flex items-center gap-4 rounded-xl px-3 py-2.5 text-sm transition-colors",
            isActive
              ? "bg-[#263850]/80 font-medium text-[#93c5fd]"
              : "font-normal text-[#e8e8e8] hover:bg-[#212121]",
          );

          if (href === "#") {
            return (
              <button key={id} type="button" className={className}>
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
        className="mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-full bg-[#3b82f6] text-sm font-semibold text-white transition-colors hover:bg-[#2563eb]"
      >
        <Plus className="h-4 w-4" strokeWidth={2} />
        New scene
      </button>

      <div className="mt-auto flex items-center gap-2.5 border-t border-[#303030] px-1 pt-4">
        <UserAvatar initials={account.initials} size={36} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-semibold text-white">
            {account.name}
          </div>
          <div className="font-sw-mono text-[11px] text-[#909090]">
            {account.plan}
          </div>
        </div>
        <button
          type="button"
          aria-label="Settings"
          className="rounded-lg p-1.5 text-[#909090] transition-colors hover:bg-[#212121] hover:text-white"
          onClick={() => {
            // TODO: open account settings
          }}
        >
          <Settings className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>
    </aside>
  );
}
