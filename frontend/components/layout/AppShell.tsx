"use client";

import { usePathname } from "next/navigation";
import { type ReactNode } from "react";

import {
  AppShellProvider,
} from "@/components/layout/AppShellContext";
import AppTopBar from "@/components/layout/AppTopBar";
import { NotificationsBadgeProvider } from "@/hooks/notifications/useNotificationsBadge";
import { cn } from "@/lib/utils";

type AppShellProps = {
  children: ReactNode;
  fullBleed?: boolean;
};

function AppShellInner({ children, fullBleed: fullBleedProp }: AppShellProps) {
  const pathname = usePathname();
  const fullBleed =
    fullBleedProp ?? pathname.startsWith("/scenes/view");

  return (
    <div className="relative flex h-screen flex-col overflow-hidden text-[var(--nord-ink)]">
      {/* Volumetric data-field background */}
      <div className="sw-field pointer-events-none fixed inset-0 -z-30" />
      <div className="sw-field-glow pointer-events-none fixed inset-0 -z-20" />
      <div className="sw-field-stars pointer-events-none fixed inset-0 -z-10" />

      <AppTopBar />

      <main
        className={cn(
          "relative min-h-0 min-w-0 w-full flex-1 bg-transparent",
          fullBleed
            ? "overflow-hidden"
            : "overflow-y-auto px-4 py-5 sm:px-6 sm:py-6",
        )}
      >
        {children}
      </main>
    </div>
  );
}

export default function AppShell(props: AppShellProps) {
  const pathname = usePathname();
  const isViewerPage = pathname.startsWith("/scenes/view");

  return (
    <AppShellProvider isViewerPage={isViewerPage}>
      <NotificationsBadgeProvider>
        <AppShellInner {...props} />
      </NotificationsBadgeProvider>
    </AppShellProvider>
  );
}
