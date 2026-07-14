import Link from "next/link";

import BrandMark from "@/components/marketing/BrandMark";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { label: "Features", href: "/#features" },
  { label: "Docs", href: "/#how-it-works" },
];

/**
 * Sticky public header for the landing page. Deliberately small: two nav
 * links plus the two auth entry points, per the "keep it simple" brief.
 */
export default function MarketingHeader() {
  return (
    <header className="sw-glass-bar sticky top-0 z-50">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <BrandMark />

        <nav className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-[var(--nord-slate)] transition-colors hover:text-[var(--nord-ink)]"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/scenes"
            className={cn(
              buttonVariants({ variant: "ghost", size: "lg" }),
              "text-[var(--nord-ink)] hover:bg-[var(--nord-tint)]",
            )}
          >
            Log in
          </Link>
          <Link
            href="/scenes?authTab=signup"
            className={cn(
              buttonVariants({ size: "lg" }),
              "bg-[var(--nord-pine)] text-[var(--nord-ink)] hover:bg-[var(--nord-pine)]",
            )}
          >
            Get Started
          </Link>
        </div>
      </div>
    </header>
  );
}
