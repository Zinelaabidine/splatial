import { cn } from "@/lib/utils";
import type { SplatPreviewTint } from "@/types/splatworks";

type PointCloudThumbnailProps = {
  preview: SplatPreviewTint;
  /** Height of the viewer area. Pass a number for a fixed px height, or "100%" to fill the parent (parent must have a defined height). */
  height?: number | string;
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
  dotRgb: string,
): string {
  const tints = layers.map(
    (color) => `radial-gradient(circle at 50% 47%, ${color}, transparent ${fadeStop})`,
  );
  const dotPx = dotSize >= 7 ? 0.6 : 0.7;
  const dotOpacity = dotSize >= 7 ? 0.85 : 0.9;
  const dots = `radial-gradient(rgba(${dotRgb},${dotOpacity}) ${dotPx}px, transparent ${dotPx + 0.1}px)`;
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
  // Dots read as "points" against the base — white pops on the dark-card
  // gradient, but the same white was invisible against the (previously
  // unreachable) light base. Use a dark warm-gray dot for the light variant.
  const dotRgb = variant === "light-ready" ? "28,28,26" : "255,255,255";

  const backgroundImage = buildBackgroundImage(preview.tintLayers, dotSize, fadeStop, dotRgb);

  // "light-ready" is meant for point-cloud tiles inside the light dashboard
  // theme; it previously still set a near-black backgroundColor (#0a0e13),
  // silently contradicting its own name and clashing with the surrounding
  // white card. It now actually renders light.
  const baseStyle =
    variant === "dark-card"
      ? {
          background:
            preview.baseGradient ??
            "radial-gradient(circle at 50% 44%, #13202b, #0a0d11 72%)",
        }
      : { backgroundColor: "#f4f4f1" };

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
