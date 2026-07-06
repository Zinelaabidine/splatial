"use client";

import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import AppSidebar from "@/components/layout/AppSidebar";
import {
  AppShellProvider,
  useAppShell,
} from "@/components/layout/AppShellContext";
import AppTopBar from "@/components/layout/AppTopBar";
import OverlayPanel from "@/components/layout/OverlayPanel";
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
  const isViewerPage = pathname.startsWith("/scenes/view");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const {
    navOverlayOpen,
    setNavOverlayOpen,
    toggleNavOverlay,
    navMenuTriggerRef,
  } = useAppShell();

  const handleMenuClick = () => {
    if (isViewerPage) {
      toggleNavOverlay();
      return;
    }

    // Same hamburger drives the mobile drawer and the desktop icon-rail —
    // only the breakpoint-relevant markup is visible at a given width.
    setMobileNavOpen((open) => !open);
    setSidebarCollapsed((collapsed) => !collapsed);
  };

  return (
    <div className="relative flex h-screen flex-col overflow-hidden text-[#eef1f7]">
      {/* Volumetric data-field background */}
      <div className="sw-field pointer-events-none fixed inset-0 -z-30" />
      <div className="sw-field-glow pointer-events-none fixed inset-0 -z-20" />
      <div className="sw-field-stars pointer-events-none fixed inset-0 -z-10" />

      <AppTopBar onMenuClick={handleMenuClick} menuButtonRef={navMenuTriggerRef} />

      <div className="relative flex min-h-0 flex-1">
        {isViewerPage ? (
          <>
            <OverlayPanel
              open={navOverlayOpen}
              onClose={() => setNavOverlayOpen(false)}
              side="left"
              ariaLabel="Navigation"
              returnFocusRef={navMenuTriggerRef}
            >
              <AppSidebar
                variant="overlay"
                collapsed={false}
                onClose={() => setNavOverlayOpen(false)}
                onNavigate={() => setNavOverlayOpen(false)}
              />
            </OverlayPanel>

            <main className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-transparent">
              {children}
            </main>
          </>
        ) : (
          <>
            {mobileNavOpen && (
              <button
                type="button"
                aria-label="Close menu"
                className="fixed inset-0 top-14 z-40 bg-black/60 md:hidden"
                onClick={() => setMobileNavOpen(false)}
              />
            )}

            {/* Mobile overlay drawer — always shows the full, labeled sidebar */}
            <div
              className={cn(
                "fixed inset-y-14 left-0 z-50 transform transition-transform md:hidden",
                mobileNavOpen ? "translate-x-0" : "-translate-x-full",
              )}
            >
              <AppSidebar collapsed={false} onNavigate={() => setMobileNavOpen(false)} />
            </div>

            {/* Desktop static sidebar — collapses to an icon rail via the hamburger */}
            <div className="hidden md:block">
              <AppSidebar collapsed={sidebarCollapsed} />
            </div>

            <main
              className={cn(
                "min-w-0 flex-1 bg-transparent",
                fullBleed
                  ? "overflow-y-auto overflow-x-hidden"
                  : "overflow-y-auto px-4 py-5 sm:px-6 sm:py-6",
              )}
            >
              {children}
            </main>
          </>
        )}
      </div>
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
