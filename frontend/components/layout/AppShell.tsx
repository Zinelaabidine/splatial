"use client";

import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import AppSidebar from "@/components/layout/AppSidebar";
import { AppShellProvider } from "@/components/layout/AppShellContext";
import AppTopBar from "@/components/layout/AppTopBar";
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

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#121212] text-[#f1f1f1]">
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
          <AppSidebar />
        </div>

        <main
          className={cn(
            "min-w-0 flex-1 bg-[#121212]",
            fullBleed
              ? "overflow-hidden"
              : "overflow-y-auto px-4 py-5 sm:px-6 sm:py-6",
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

export default function AppShell(props: AppShellProps) {
  return (
    <AppShellProvider>
      <AppShellInner {...props} />
    </AppShellProvider>
  );
}
