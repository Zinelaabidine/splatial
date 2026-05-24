"use client";

import React from "react";
import { useAuthenticator } from "@aws-amplify/ui-react";

type NavItemId = "create" | "library" | "settings";

interface NavItem {
  id: NavItemId;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: "create",
    label: "Create",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
    ),
  },
  {
    id: "library",
    label: "Library",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
      >
        <path d="M3 7l9-4 9 4-9 4-9-4z" />
        <path d="M3 12l9 4 9-4" />
        <path d="M3 17l9 4 9-4" />
      </svg>
    ),
  },
  {
    id: "settings",
    label: "Settings",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

interface LayoutProps {
  /** Main canvas content (center column). */
  children: React.ReactNode;
  /** Optional right sidebar (e.g. upload queue). Hidden on small screens. */
  rightSidebar?: React.ReactNode;
  activeNav?: NavItemId;
  onNavChange?: (id: NavItemId) => void;
}

/**
 * Three-column application shell:
 *
 *   [ left sidebar (256) ] [ main canvas (flex-1) ] [ right sidebar (320) ]
 *
 * Designed to be wrapped by <AuthGate>, so `useAuthenticator` is guaranteed
 * to have an active user/signOut.
 */
export default function Layout({
  children,
  rightSidebar,
  activeNav = "create",
  onNavChange,
}: LayoutProps) {
  const { user, signOut } = useAuthenticator((ctx) => [ctx.user]);

  const email =
    (user?.signInDetails?.loginId as string | undefined) ??
    user?.username ??
    "";
  const initial = email.charAt(0).toUpperCase() || "?";

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      <aside className="w-64 bg-white border-r border-slate-100 flex flex-col justify-between p-4">
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-2 px-2 pt-1">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 grid place-items-center text-white text-xs font-semibold">
              S
            </div>
            <span className="text-sm font-semibold tracking-tight text-slate-900">
              Splatial
            </span>
          </div>

          <nav className="flex flex-col gap-0.5">
            {NAV_ITEMS.map((item) => {
              const active = item.id === activeNav;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavChange?.(item.id)}
                  className={[
                    "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-slate-100 text-slate-900"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
                  ].join(" ")}
                >
                  <span
                    className={
                      active ? "text-indigo-500" : "text-slate-400"
                    }
                  >
                    {item.icon}
                  </span>
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50/60 p-2.5">
            <div className="h-7 w-7 rounded-full bg-slate-900 text-white grid place-items-center text-xs font-semibold">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-slate-900">
                {email || "Signed in"}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-slate-400">
                Free plan
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={signOut}
            className="hidden flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col p-8 overflow-y-auto items-center justify-center">
        {children}
      </main>

      {rightSidebar ? (
        <aside className="hidden lg:flex w-80 bg-white border-l border-slate-100 p-5 flex-col gap-6 overflow-y-auto">
          {rightSidebar}
        </aside>
      ) : null}
    </div>
  );
}
