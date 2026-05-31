"use client";

import { Camera } from "lucide-react";

import OrientationWidget from "@/components/dashboard/OrientationWidget";
import { cn } from "@/lib/utils";

type SculptureViewportProps = {
  title: string;
  className?: string;
};

/** Rotation axes for each ring so the stack looks like a gyroscope / atom. */
const RING_TILTS = [
  "rotateX(72deg) rotateZ(0deg)",
  "rotateX(55deg) rotateZ(36deg)",
  "rotateX(38deg) rotateZ(72deg)",
  "rotateX(20deg) rotateZ(108deg)",
  "rotateX(5deg)  rotateZ(144deg)",
];

/**
 * Full-screen viewport placeholder depicting a multi-ring minimalist sculpture
 * on a pedestal with soft, even studio lighting.
 */
export default function SculptureViewport({ title, className }: SculptureViewportProps) {
  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden bg-gradient-to-b from-gray-100 via-gray-50 to-gray-200",
        className,
      )}
    >
      {/* Soft studio lighting */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_18%,rgba(255,255,255,0.92),transparent_52%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_15%_70%,rgba(147,51,234,0.05),transparent_45%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_85%_80%,rgba(147,51,234,0.07),transparent_45%)]" />

      {/* Floor / ground plane */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[36%] bg-gradient-to-t from-gray-300/50 to-transparent" />
      {/* Perspective horizon line */}
      <div className="pointer-events-none absolute bottom-[23%] left-1/2 h-px w-[min(68%,600px)] -translate-x-1/2 bg-gradient-to-r from-transparent via-gray-400/40 to-transparent" />
      {/* Pedestal shadow on floor */}
      <div className="pointer-events-none absolute bottom-[17.5%] left-1/2 h-4 w-32 -translate-x-1/2 rounded-full bg-gray-500/20 blur-md" />

      {/* Sculpture stage */}
      <div className="absolute inset-0 flex items-end justify-center pb-[16%]">
        <div className="relative flex flex-col items-center">
          {/* Pedestal */}
          <div className="relative z-0">
            {/* Pedestal cap */}
            <div className="h-2.5 w-36 rounded-sm bg-gradient-to-b from-gray-250 to-gray-350 shadow-sm"
                 style={{ background: "linear-gradient(to bottom, #d1d5db, #9ca3af)" }} />
            {/* Pedestal body */}
            <div
              className="mx-auto h-16 w-28 shadow-lg"
              style={{
                background: "linear-gradient(160deg, #f3f4f6 0%, #e5e7eb 40%, #d1d5db 100%)",
                borderRadius: "2px",
              }}
            />
            {/* Pedestal base */}
            <div
              className="mx-auto h-2 w-32"
              style={{
                background: "linear-gradient(to bottom, #d1d5db, #9ca3af)",
                borderRadius: "1px",
              }}
            />
          </div>

          {/* Multi-ring sculpture — positioned above pedestal */}
          <div
            className="absolute left-1/2 -translate-x-1/2"
            style={{ bottom: "4.75rem", perspective: "480px" }}
          >
            {/* Slow continuous orbit animation wrapper */}
            <div
              className="relative h-48 w-48"
              style={{
                animation: "sculpture-orbit 18s linear infinite",
                transformStyle: "preserve-3d",
              }}
            >
              {/* Rings — each uniquely tilted to form a gyroscope/atom shape */}
              {[0, 1, 2, 3, 4].map((i) => {
                const size = 88 - i * 14; // 88 → 32 (%)
                return (
                  <div
                    key={i}
                    className="absolute left-1/2 top-1/2 rounded-full border-2"
                    style={{
                      width: `${size}%`,
                      height: `${size}%`,
                      transform: `translate(-50%, -50%) ${RING_TILTS[i]}`,
                      borderColor: `rgba(147, 51, 234, ${0.35 + i * 0.12})`,
                      opacity: 0.6 + i * 0.08,
                      boxShadow: `0 0 ${14 + i * 4}px rgba(147, 51, 234, ${0.12 + i * 0.04})`,
                    }}
                  />
                );
              })}

              {/* Core orb */}
              <div
                className="absolute left-1/2 top-1/2 rounded-full"
                style={{
                  width: "10%",
                  height: "10%",
                  transform: "translate(-50%, -50%)",
                  background: "radial-gradient(circle at 35% 35%, rgba(216,180,254,0.9), rgba(147,51,234,0.75))",
                  boxShadow: "0 0 16px rgba(147, 51, 234, 0.55)",
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Scene title overlay */}
      <div className="pointer-events-none absolute left-6 top-6">
        <h2 className="text-lg font-medium tracking-tight text-gray-800/65 drop-shadow-sm">
          {title}
        </h2>
      </div>

      {/* View controls panel — frosted glass, bottom-left */}
      <div className="absolute bottom-6 left-6">
        <div className="rounded-xl bg-white/30 p-2 shadow-xl backdrop-blur-sm">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-800 transition-colors hover:bg-white/40"
          >
            <Camera className="h-3.5 w-3.5 text-gray-700" />
            View Controls
          </button>
        </div>
      </div>

      {/* XYZ orientation gizmo — bottom-right */}
      <OrientationWidget className="absolute bottom-6 right-6" />

      {/* Keyframe for slow orbit */}
      <style>{`
        @keyframes sculpture-orbit {
          from { transform: rotateY(0deg); }
          to   { transform: rotateY(360deg); }
        }
      `}</style>
    </div>
  );
}
