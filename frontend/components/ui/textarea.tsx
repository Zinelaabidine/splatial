import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-[80px] w-full rounded-lg border border-[var(--nord-hairline)] bg-[var(--nord-surface)] px-3 py-2 text-sm text-[var(--nord-ink)] placeholder:text-[var(--nord-slate)] outline-none transition-colors focus-visible:border-[var(--nord-teal)] focus-visible:ring-2 focus-visible:ring-[var(--nord-teal)] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
