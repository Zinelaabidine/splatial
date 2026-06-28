"use client";

import { cn } from "@/lib/utils";

type OrientationWidgetProps = {
  className?: string;
};

/** Small XYZ orientation gizmo typical of 3D authoring tools. */
export default function OrientationWidget({ className }: OrientationWidgetProps) {
  return (
    <div
      className={cn(
        "pointer-events-none select-none bg-white/30 backdrop-blur-sm shadow-xl rounded-lg p-2",
        className,
      )}
      aria-hidden
    >
      <svg width="56" height="56" viewBox="0 0 56 56" className="block">
        <circle cx="28" cy="28" r="26" fill="rgba(255,255,255,0.45)" stroke="rgba(0,0,0,0.06)" />
        <line x1="28" y1="28" x2="28" y2="8" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
        <polygon points="28,4 24,10 32,10" fill="#ef4444" />
        <text x="30" y="12" fontSize="7" fill="#ef4444" fontWeight="600">
          Y
        </text>
        <line x1="28" y1="28" x2="46" y2="28" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" />
        <polygon points="50,28 44,24 44,32" fill="#22c55e" />
        <text x="48" y="31" fontSize="7" fill="#22c55e" fontWeight="600">
          X
        </text>
        <line x1="28" y1="28" x2="18" y2="40" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" />
        <polygon points="14,44 16,36 22,40" fill="#3b82f6" />
        <text x="10" y="46" fontSize="7" fill="#3b82f6" fontWeight="600">
          Z
        </text>
        <circle cx="28" cy="28" r="2.5" fill="#374151" />
      </svg>
    </div>
  );
}
