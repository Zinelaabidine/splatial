import { cn } from "@/lib/utils";
import type { SplatPreviewTint } from "@/types/splatworks";

type PointCloudThumbnailProps = {
  preview: SplatPreviewTint;
  /** Height of the viewer area. */
  height?: number;
  /** Enable slow rotation (Splats gallery). */
  spin?: boolean;
  /** Dark base for light-dashboard ready tiles. */
  variant?: "dark-card" | "light-ready";
  className?: string;
};

function buildBackgroundImage(
  layers: string[],
  dotSize: number,
  fadeStop: string,
): string {
  const tints = layers.map(
    (color) => `radial-gradient(circle at 50% 47%, ${color}, transparent ${fadeStop})`,
  );
  const dotPx = dotSize >= 7 ? 0.6 : 0.7;
  const dotOpacity = dotSize >= 7 ? 0.85 : 0.9;
  const dots = `radial-gradient(rgba(255,255,255,${dotOpacity}) ${dotPx}px, transparent ${dotPx + 0.1}px)`;
  return [...tints, dots].join(", ");
}

export default function PointCloudThumbnail({
  preview,
  height = 190,
  spin = false,
  variant = "dark-card",
  className,
}: PointCloudThumbnailProps) {
  const dotSize = preview.dotSize ?? 6;
  const fadeStop = variant === "light-ready" ? "58%" : "52%";

  const backgroundImage = buildBackgroundImage(preview.tintLayers, dotSize, fadeStop);

  const baseStyle =
    variant === "dark-card"
      ? {
          background:
            preview.baseGradient ??
            "radial-gradient(circle at 50% 44%, #13202b, #0a0d11 72%)",
        }
      : { backgroundColor: "#0a0e13" };

  const bgSize =
    preview.tintLayers.map(() => "auto").join(", ") + `, ${dotSize}px ${dotSize}px`;

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{ height, ...baseStyle }}
    >
      <div
        className={cn("absolute inset-[-30%]", spin && "sw-thumb-spin")}
        style={{ backgroundImage, backgroundSize: bgSize }}
      />
    </div>
  );
}
