import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-[80px] w-full rounded-lg border border-[#404040] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-[#737373] outline-none transition-colors focus-visible:border-[#19c2ad]/60 focus-visible:ring-2 focus-visible:ring-[#19c2ad]/20 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
