"use client";

import Link from "next/link";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CreditCard, LogOut, UserCog } from "lucide-react";

import { UserAvatar } from "@/components/splatworks/SplatworksLogo";
import { useAppAccount } from "@/hooks/layout/useAppAccount";
import { useDismissablePopover } from "@/hooks/layout/useDismissablePopover";
import { ApiRequestError } from "@/lib/api/apiErrors";
import { cn } from "@/lib/utils";
import { getAccountUsage } from "@/services/accountService";
import type { AccountUsageResponse } from "@/types/api";

const POPUP_PANEL_CLASS = cn(
  "absolute right-0 top-full z-[var(--z-app-popover)] mt-2",
  "w-[320px] max-w-[calc(100vw-32px)] overflow-hidden rounded-[14px] p-2.5",
  "border border-[var(--nord-hairline)] bg-[var(--nord-bg)]",
  "shadow-[0_18px_48px_rgba(0,0,0,0.42),0_2px_6px_rgba(0,0,0,0.28)]",
);

const ACTION_ROW_CLASS = cn(
  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm",
  "text-[var(--nord-ink)] transition-colors",
  "hover:bg-[var(--nord-tint)]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nord-hairline)]",
);

function formatGB(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb >= 10 ? gb.toFixed(0) : gb.toFixed(1)} GB`;
}

function StorageUsageBlock({ open }: { open: boolean }) {
  const [usage, setUsage] = useState<AccountUsageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError(null);
    try {
      const res = await getAccountUsage(ctrl.signal);
      if (ctrl.signal.aborted) return;
      setUsage(res);
    } catch (err) {
      if (ctrl.signal.aborted) return;
      const message =
        err instanceof ApiRequestError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load storage usage";
      setError(message);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => abortRef.current?.abort();
  }, [open, load]);

  if (error || !usage) return null;

  const pct =
    usage.capBytes > 0
      ? Math.min(100, Math.round((usage.usedBytes / usage.capBytes) * 100))
      : 0;

  return (
    <div
      className="rounded-lg px-3 py-2.5"
      aria-label={`Storage: ${formatGB(usage.usedBytes)} of ${formatGB(usage.capBytes)} used`}
    >
      <div className="flex items-center justify-between gap-3 text-[13px]">
        <span className="font-medium text-[var(--nord-ink)]">Storage</span>
        <span className="text-[var(--nord-slate)]">
          {formatGB(usage.usedBytes)} of {formatGB(usage.capBytes)} used
        </span>
      </div>
      <div
        className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[var(--nord-tint)]"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Storage used"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width]",
            pct >= 100 ? "bg-[#C97A7A]" : "bg-[var(--nord-tint)]",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

type AccountMenuPopupProps = {
  account: ReturnType<typeof useAppAccount>;
  open: boolean;
  onClose: () => void;
  onSignOut: () => void;
};

function AccountMenuPopup({
  account,
  open,
  onClose,
  onSignOut,
}: AccountMenuPopupProps) {
  return (
    <section
      role="dialog"
      aria-label="Account menu"
      className={POPUP_PANEL_CLASS}
    >
      <h2 className="sr-only">Account menu</h2>

      <div className="px-3 py-3">
        <div className="flex items-center gap-3">
          <UserAvatar initials={account.initials} size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold leading-snug text-[var(--nord-ink)]">
              {account.name}
            </p>
            <p className="truncate text-[13px] leading-snug text-[var(--nord-slate)]">
              {account.email}
            </p>
          </div>
        </div>
      </div>

      <nav aria-label="Account settings" className="flex flex-col gap-0.5">
        <Link
          href="/settings/profile"
          onClick={onClose}
          className={ACTION_ROW_CLASS}
        >
          <UserCog className="h-4 w-4 shrink-0 text-[var(--nord-slate)]" strokeWidth={1.75} aria-hidden />
          <span className="min-w-0 flex-1 truncate">Profile settings</span>
        </Link>

        <div className={cn(ACTION_ROW_CLASS, "cursor-default hover:bg-transparent")}>
          <CreditCard className="h-4 w-4 shrink-0 text-[var(--nord-slate)]" strokeWidth={1.75} aria-hidden />
          <span className="min-w-0 flex-1 truncate">Plan</span>
          <span className="shrink-0 text-[13px] text-[var(--nord-slate)]">{account.plan}</span>
        </div>

        <StorageUsageBlock open={open} />

        <Link
          href="/settings/profile"
          onClick={onClose}
          className={ACTION_ROW_CLASS}
        >
          <Bell className="h-4 w-4 shrink-0 text-[var(--nord-slate)]" strokeWidth={1.75} aria-hidden />
          <span className="min-w-0 flex-1 truncate">Email notifications</span>
        </Link>
      </nav>

      <div className="mt-2 border-t border-[var(--nord-hairline)] pt-2">
        <button
          type="button"
          onClick={onSignOut}
          className={cn(
            ACTION_ROW_CLASS,
            "text-[#E57373] hover:bg-[#E57373]/10 focus-visible:ring-[var(--nord-danger)]",
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
          <span className="min-w-0 flex-1 truncate">Sign out</span>
        </button>
      </div>
    </section>
  );
}

export default function SettingsPanel() {
  const account = useAppAccount();
  const { signOut } = useAuthenticator((ctx) => [ctx.signOut]);
  const { open, setOpen, ref } = useDismissablePopover<HTMLDivElement>();

  const close = () => setOpen(false);

  const handleSignOut = () => {
    close();
    signOut();
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label="Account menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-80",
          open && "ring-2 ring-[var(--nord-hairline)]",
        )}
      >
        <UserAvatar initials={account.initials} size={30} />
      </button>

      {open ? (
        <AccountMenuPopup
          account={account}
          open={open}
          onClose={close}
          onSignOut={handleSignOut}
        />
      ) : null}
    </div>
  );
}
