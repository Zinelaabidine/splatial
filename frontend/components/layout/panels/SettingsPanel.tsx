"use client";

import Link from "next/link";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { useState } from "react";

import SlideOverPanel from "@/components/layout/panels/SlideOverPanel";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/splatworks/SplatworksLogo";
import { useAppAccount } from "@/hooks/layout/useAppAccount";
import { cn } from "@/lib/utils";

type SettingsPanelProps = {
  open: boolean;
  onClose: () => void;
};

const SECTION_HEADING =
  "text-xs font-semibold uppercase tracking-widest text-[#606060] px-4 pt-5 pb-2";

export default function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const account = useAppAccount();
  const { signOut } = useAuthenticator((ctx) => [ctx.signOut]);
  const [emailNotifications, setEmailNotifications] = useState(true);

  const handleSignOut = () => {
    onClose();
    signOut();
  };

  return (
    <SlideOverPanel
      open={open}
      onClose={onClose}
      title="Settings"
      panelClassName="w-[320px]"
    >
      <section>
        <h3 className={SECTION_HEADING}>Profile</h3>
        <div className="flex items-center gap-3 px-4 pb-3">
          <UserAvatar initials={account.initials} size={48} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">
              {account.name}
            </p>
            <p className="truncate font-sw-mono text-xs text-[#909090]">
              {account.email}
            </p>
          </div>
        </div>
        <div className="px-4 pb-4">
          <Button
            variant="outline"
            size="sm"
            className="w-full border-[#404040] bg-transparent text-[#e8e8e8] hover:bg-[#212121]"
            render={
              <Link href="/settings/profile" onClick={onClose} />
            }
          >
            Profile settings
          </Button>
        </div>
      </section>

      <div className="border-t border-[#1f1f1f] mx-4" />

      <section>
        <h3 className={SECTION_HEADING}>Plan</h3>
        <div className="px-4 pb-4">
          <p className="text-sm text-white">{account.plan}</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 h-auto px-0 text-[#909090] hover:bg-transparent hover:text-white"
            render={
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
              />
            }
          >
            Manage subscription
          </Button>
        </div>
      </section>

      <div className="border-t border-[#1f1f1f] mx-4" />

      <section>
        <h3 className={SECTION_HEADING}>Preferences</h3>
        <label className="flex cursor-pointer items-center justify-between px-4 pb-4">
          <span className="text-sm text-[#e8e8e8]">Email notifications</span>
          <input
            type="checkbox"
            checked={emailNotifications}
            onChange={(e) => setEmailNotifications(e.target.checked)}
            className={cn(
              "h-4 w-4 shrink-0 cursor-pointer rounded border border-[#404040] bg-[#1a1a1a]",
              "accent-[#3b82f6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6]/50",
            )}
          />
        </label>
      </section>

      <div className="border-t border-[#1f1f1f] mx-4" />

      <section>
        <h3 className={SECTION_HEADING}>Danger zone</h3>
        <button
          type="button"
          onClick={handleSignOut}
          className="w-full text-left px-4 py-2.5 text-sm text-[#f87171] hover:bg-red-950/30 transition-colors"
        >
          Sign out
        </button>
      </section>
    </SlideOverPanel>
  );
}
