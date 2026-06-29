"use client";

import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import ActivityPanel from "@/components/layout/panels/ActivityPanel";
import SettingsPanel from "@/components/layout/panels/SettingsPanel";
import TrainingPanel from "@/components/layout/panels/TrainingPanel";
import AppSidebar from "@/components/layout/AppSidebar";
import { AppShellProvider } from "@/components/layout/AppShellContext";
import AppTopBar from "@/components/layout/AppTopBar";
import { useTrainingCount } from "@/hooks/layout/useTrainingCount";
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [openPanel, setOpenPanel] = useState<"training" | "activity" | null>(
    null,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const trainingCount = useTrainingCount();

  return (
    <div className="relative flex h-screen flex-col overflow-hidden text-[#eef1f7]">
      {/* Volumetric data-field background */}
      <div className="sw-field pointer-events-none fixed inset-0 -z-30" />
      <div className="sw-field-glow pointer-events-none fixed inset-0 -z-20" />
      <div className="sw-field-stars pointer-events-none fixed inset-0 -z-10" />

      <AppTopBar onMenuClick={() => setMobileNavOpen((o) => !o)} />

      <div className="flex min-h-0 flex-1">
        {mobileNavOpen && (
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 top-14 z-40 bg-black/60 md:hidden"
            onClick={() => setMobileNavOpen(false)}
          />
        )}

        <div
          className={cn(
            "fixed inset-y-14 left-0 z-50 transform transition-transform md:static md:translate-x-0",
            mobileNavOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          )}
        >
          <AppSidebar
            trainingCount={trainingCount}
            onNavAction={(id) => {
              setOpenPanel(id);
              setMobileNavOpen(false);
            }}
            onSettingsClick={() => {
              setSettingsOpen(true);
              setMobileNavOpen(false);
            }}
          />
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
      </div>

      <TrainingPanel
        open={openPanel === "training"}
        onClose={() => setOpenPanel(null)}
      />
      <ActivityPanel
        open={openPanel === "activity"}
        onClose={() => setOpenPanel(null)}
      />
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}

export default function AppShell(props: AppShellProps) {
  return (
    <AppShellProvider>
      <NotificationsBadgeProvider>
        <AppShellInner {...props} />
      </NotificationsBadgeProvider>
    </AppShellProvider>
  );
}
