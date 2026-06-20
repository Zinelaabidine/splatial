"use client";

import { useMemo } from "react";

import type { SplatSubject } from "@/types/splatworks";

type Particle = {
  x: number;
  y: number;
  r: number;
  o: number;
  c: string;
};

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function buildParticles(subject: SplatSubject, count: number): Particle[] {
  const rand = seededRandom(subject.charCodeAt(0) * 997);
  const palettes: Record<SplatSubject, string[]> = {
    vase: ["#c4a882", "#8eb4e8", "#e8dcc8", "#6a9fd4", "#f0e6d6"],
    fountain: ["#5eb3ff", "#a8dcff", "#3d8fd9", "#cce9ff", "#7ec8fa"],
    interior: ["#98b4a8", "#c8d8e8", "#e8c898", "#88a098", "#d4e0ec"],
    trail: ["#4ade80", "#86efac", "#22c55e", "#bbf7d0", "#166534"],
    desk: ["#94a3b8", "#cbd5e1", "#64748b", "#e2e8f0", "#3b82f6"],
    statue: ["#a8c4b8", "#d4c4a8", "#88a898", "#e8e0d0", "#6b9080"],
  };
  const colors = palettes[subject];
  const particles: Particle[] = [];

  for (let i = 0; i < count; i++) {
    let x = 0;
    let y = 0;
    const t = rand();

    switch (subject) {
      case "vase": {
        const angle = t * Math.PI * 2;
        const h = rand();
        x = 50 + Math.cos(angle) * (12 + h * 10);
        y = 28 + h * 44 + Math.sin(angle) * (6 + h * 4);
        break;
      }
      case "fountain": {
        x = 50 + (rand() - 0.5) * 38;
        y = 55 - Math.pow(rand(), 0.6) * 42 + (rand() - 0.5) * 8;
        break;
      }
      case "interior": {
        x = 15 + rand() * 70;
        y = 40 + rand() * 35;
        if (rand() > 0.7) y = 25 + rand() * 20;
        break;
      }
      case "trail": {
        x = 10 + rand() * 80;
        y = 45 + rand() * 30 + Math.sin(x * 0.08) * 8;
        break;
      }
      case "desk": {
        if (rand() > 0.55) {
          x = 58 + rand() * 22;
          y = 28 + rand() * 22;
        } else {
          x = 20 + rand() * 55;
          y = 52 + rand() * 28;
        }
        break;
      }
      case "statue": {
        const angle = t * Math.PI * 2;
        x = 50 + Math.cos(angle) * (8 + rand() * 6);
        y = 22 + rand() * 50;
        break;
      }
    }

    particles.push({
      x,
      y,
      r: 0.35 + rand() * 1.4,
      o: 0.35 + rand() * 0.55,
      c: colors[Math.floor(rand() * colors.length)] ?? colors[0],
    });
  }

  return particles;
}

type SplatPreviewVisualProps = {
  subject: SplatSubject;
  className?: string;
};

/** High-fidelity gaussian-splat-style preview placeholder (swap for WebGL canvas in prod). */
export default function SplatPreviewVisual({
  subject,
  className,
}: SplatPreviewVisualProps) {
  const particles = useMemo(() => buildParticles(subject, 140), [subject]);

  const ambient: Record<SplatSubject, string> = {
    vase: "radial-gradient(ellipse 80% 70% at 50% 55%, #1a2838 0%, #0d1117 70%)",
    fountain: "radial-gradient(ellipse 70% 60% at 50% 65%, #0c1a2e 0%, #080c12 70%)",
    interior: "radial-gradient(ellipse 90% 80% at 50% 60%, #141a18 0%, #0a0e0c 70%)",
    trail: "radial-gradient(ellipse 100% 70% at 50% 70%, #0a1810 0%, #060a08 70%)",
    desk: "radial-gradient(ellipse 85% 75% at 50% 55%, #121820 0%, #0a0c10 70%)",
    statue: "radial-gradient(ellipse 75% 85% at 50% 50%, #121816 0%, #0a0e0c 70%)",
  };

  return (
    <div
      className={className}
      style={{ background: ambient[subject] }}
    >
      <div className="sw-thumb-spin absolute inset-[-15%]">
        <svg
          viewBox="0 0 100 100"
          className="h-full w-full"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden
        >
          <defs>
            <filter id="splat-glow">
              <feGaussianBlur stdDeviation="0.6" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g filter="url(#splat-glow)">
            {particles.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={p.r}
                fill={p.c}
                opacity={p.o}
              />
            ))}
          </g>
        </svg>
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.07),transparent_45%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/50 to-transparent" />
    </div>
  );
}
