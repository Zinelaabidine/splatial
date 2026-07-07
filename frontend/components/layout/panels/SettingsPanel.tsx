"use client";

import Link from "next/link";
import { useAuthenticator } from "@aws-amplify/ui-react";
import type { ReactNode } from "react";
import { Bell, ChevronRight, CreditCard, LogOut, UserCog } from "lucide-react";

import { UserAvatar } from "@/components/splatworks/SplatworksLogo";
import { useAppAccount } from "@/hooks/layout/useAppAccount";
import { useDismissablePopover } from "@/hooks/layout/useDismissablePopover";
import { cn } from "@/lib/utils";

const ROW_CLASSNAME = (danger?: boolean) =>
  cn(
    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
    danger ? "text-[#f87171] hover:bg-red-950/30" : "text-[#e8e8e8] hover:bg-white/[0.06]",
  );

// Single-line, icon-driven row — the Facebook-menu building block. Rows
// that navigate somewhere show a trailing chevron by default; pass
// `trailing` to swap that for an inline control (e.g. a toggle), or
// `trailing={null}` to suppress it entirely for terminal actions.
function MenuRow({
  icon: Icon,
  label,
  detail,
  trailing,
  danger,
  href,
  onClick,
}: {
  icon: typeof Bell;
  label: string;
  detail?: string;
  trailing?: ReactNode;
  danger?: boolean;
  href?: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />
      <span className="min-w-0 flex-1 truncate">
        {label}
        {detail && <span className="ml-1.5 text-[#909090]">{detail}</span>}
      </span>
      {trailing !== undefined ? (
        trailing
      ) : (
        <ChevronRight className="h-4 w-4 shrink-0 text-[#606060]" strokeWidth={1.5} aria-hidden />
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} onClick={onClick} className={ROW_CLASSNAME(danger)}>
        {content}
      </Link>
    );
  }

  // A custom trailing control with no row-level action (e.g. a checkbox)
  // owns its own interaction — wrapping it in a <button> would nest
  // interactive elements, which is invalid HTML.
  if (trailing !== undefined && !onClick) {
    return <div className={ROW_CLASSNAME(danger)}>{content}</div>;
  }

  return (
    <button type="button" onClick={onClick} className={ROW_CLASSNAME(danger)}>
      {content}
    </button>
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
          open && "ring-2 ring-white/30",
        )}
      >
        <UserAvatar initials={account.initials} size={30} />
      </button>

      {open && (
        <div
          aria-label="Account menu"
          className="sw-popover absolute right-0 top-full z-[var(--z-app-popover)] mt-2 w-80 overflow-hidden rounded-xl p-2"
        >
          {/* Profile card — a card inside the card, the Facebook signature. */}
          <div className="rounded-lg bg-white/[0.05] p-3">
            <div className="flex items-center gap-3">
              <UserAvatar initials={account.initials} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{account.name}</p>
                <p className="truncate font-sw-mono text-xs text-[#909090]">{account.email}</p>
              </div>
            </div>
            <Link
              href="/settings/profile"
              onClick={close}
              className="mt-3 flex items-center gap-2 rounded-md bg-white/[0.06] px-3 py-2 text-xs font-medium text-[#e8e8e8] transition-colors hover:bg-white/[0.1]"
            >
              <UserCog className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
              Profile settings
            </Link>
          </div>

          <div className="my-2 flex flex-col gap-0.5">
            <MenuRow icon={CreditCard} label="Plan" detail={account.plan} />
            <MenuRow
              icon={Bell}
              label="Email notifications"
              href="/settings/profile"
              onClick={close}
            />
          </div>

          <div className="border-t border-white/[0.06] pt-2">
            <MenuRow icon={LogOut} label="Sign out" danger trailing={null} onClick={handleSignOut} />
          </div>
        </div>
      )}
    </div>
  );
}
