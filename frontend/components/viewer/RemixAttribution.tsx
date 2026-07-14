import Link from "next/link";

import { cn } from "@/lib/utils";

type RemixAttributionProps = {
  forkedFromSceneId: string;
  forkedFromUsername: string;
  className?: string;
};

export default function RemixAttribution({
  forkedFromSceneId,
  forkedFromUsername,
  className,
}: RemixAttributionProps) {
  const handle = forkedFromUsername.trim();
  if (!handle) return null;

  return (
    <p
      className={cn(
        "font-sw-mono text-[11px] text-[var(--nord-ink)]",
        className,
      )}
    >
      Remixed from{" "}
      <Link
        href={`/u/${encodeURIComponent(handle)}`}
        className="text-[var(--nord-ink)] underline-offset-2 hover:text-[var(--nord-ink)] hover:underline"
      >
        @{handle}
      </Link>
      {" · "}
      <Link
        href={`/scenes/view?id=${encodeURIComponent(forkedFromSceneId)}`}
        className="text-[var(--nord-ink)] underline-offset-2 hover:text-[var(--nord-ink)] hover:underline"
      >
        original scene
      </Link>
    </p>
  );
}
