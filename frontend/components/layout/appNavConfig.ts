import {
  Bookmark,
  Box,
  Compass,
  Home,
  Rss,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export type NavId = "explore" | "feed" | "saved" | "home" | "splats" | "admin";

export type NavItem = {
  id: NavId;
  label: string;
  href: string;
  icon: LucideIcon;
  match: (path: string) => boolean;
};

/** Primary links shown in the top navigation bar. */
export const TOP_BAR_NAV: NavItem[] = [
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
    id: "saved",
    label: "Saved",
    href: "/saved",
    icon: Bookmark,
    match: (p) => p === "/saved",
  },
];

export const APP_NAV: NavItem[] = [
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

export const ADMIN_NAV_ITEM: NavItem = {
  id: "admin",
  label: "Admin",
  href: "/admin",
  icon: ShieldCheck,
  match: (p) => p === "/admin" || p.startsWith("/admin/"),
};

export const SECTION_LABELS: { match: (p: string) => boolean; label: string }[] =
  [
    {
      match: (p) => p === "/scenes" || p.startsWith("/scenes/create"),
      label: "Scenes",
    },
    { match: (p) => p.startsWith("/scenes/view"), label: "Viewer" },
    { match: (p) => p === "/splats", label: "My Splats" },
    { match: (p) => p === "/explore", label: "Explore" },
    { match: (p) => p === "/feed", label: "Feed" },
    { match: (p) => p === "/saved", label: "Saved" },
    { match: (p) => p.startsWith("/admin"), label: "Admin" },
    { match: (p) => p.startsWith("/settings"), label: "Settings" },
  ];
