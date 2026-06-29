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
        "font-sw-mono text-[11px] text-white/70",
        className,
      )}
    >
      Remixed from{" "}
      <Link
        href={`/u/${encodeURIComponent(handle)}`}
        className="text-white/90 underline-offset-2 hover:text-white hover:underline"
      >
        @{handle}
      </Link>
      {" · "}
      <Link
        href={`/scenes/view?id=${encodeURIComponent(forkedFromSceneId)}`}
        className="text-white/90 underline-offset-2 hover:text-white hover:underline"
      >
        original scene
      </Link>
    </p>
  );
}
