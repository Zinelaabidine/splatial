import Link from "next/link";
import { Boxes } from "lucide-react";

import { cn } from "@/lib/utils";

type BrandMarkProps = {
  href?: string;
  className?: string;
  wordmarkClassName?: string;
};

/**
 * Shared logo mark used on the public marketing header, footer, and the
 * login shell. Not used inside the authenticated app shell (that keeps its
 * own "Splatworks" breadcrumb treatment in AppTopBar).
 */
export default function BrandMark({ href = "/", className, wordmarkClassName }: BrandMarkProps) {
  return (
    <Link href={href} className={cn("group flex items-center gap-2.5", className)}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#19c2ad] to-[#0e8f80] text-black shadow-[0_2px_10px_rgba(25,194,173,0.35)] transition-transform group-hover:scale-105">
        <Boxes className="h-[18px] w-[18px]" strokeWidth={2.25} />
      </span>
      <span
        className={cn(
          "text-[17px] font-semibold tracking-tight text-white",
          wordmarkClassName,
        )}
      >
        Splatial
      </span>
    </Link>
  );
}
