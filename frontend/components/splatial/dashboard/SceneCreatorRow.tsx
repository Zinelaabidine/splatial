"use client";

import { UserAvatar } from "@/components/splatial/SplatialLogo";
import { useAppAccount } from "@/hooks/layout/useAppAccount";
import { cn } from "@/lib/utils";

type SceneCreatorRowProps = {
  className?: string;
  /** Stacked layout for featured card. */
  stacked?: boolean;
  /** Single-line avatar + name beside title. */
  inline?: boolean;
};

export default function SceneCreatorRow({
  className,
  stacked = false,
  inline = false,
}: SceneCreatorRowProps) {
  const account = useAppAccount();

  if (inline) {
    return (
      <span
        className={cn(
          "inline-flex min-w-0 max-w-[48%] items-center gap-1.5",
          className,
        )}
      >
        <UserAvatar initials={account.initials} size={18} />
        <span className="truncate text-[11px] font-medium text-[var(--nord-ink)]">
          {account.name}
        </span>
      </span>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2",
        stacked ? "mb-2.5" : "mb-0",
        className,
      )}
    >
      <UserAvatar initials={account.initials} size={stacked ? 28 : 22} />
      <div className="min-w-0">
        <p
          className={cn(
            "truncate font-medium text-[var(--nord-ink)]",
            stacked ? "text-sm" : "text-xs",
          )}
        >
          {account.name}
        </p>
        {stacked && (
          <p className="truncate font-sw-mono text-[11px] text-[var(--nord-slate)]">
            Creator
          </p>
        )}
      </div>
    </div>
  );
}
