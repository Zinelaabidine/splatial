import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  Cloud,
  Eye,
  GitFork,
  Pencil,
  Sparkles,
  Upload,
  Zap,
} from "lucide-react";

import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FEATURES = [
  {
    icon: Sparkles,
    title: "Unmatched photorealism",
    description:
      "Millions of Gaussian splats captured from ordinary photos, rendered with real volumetric detail instead of flat meshes.",
  },
  {
    icon: Cloud,
    title: "Cloud-native scale",
    description:
      "Training and rendering run on managed GPU infrastructure, so scenes stay fast and shareable without local hardware.",
  },
  {
    icon: Pencil,
    title: "Real-time editing",
    description:
      "Trim, crop, and refine a splat directly in the browser and see the volumetric result update instantly.",
  },
  {
    icon: GitFork,
    title: "Built to share",
    description:
      "Publish scenes to your profile, save shots and tours, and fork anyone else's work into your own.",
  },
];

const WORKFLOW_STEPS = [
  { icon: Upload, label: "Upload", description: "Drop in photos or a video walkthrough of a space or object." },
  { icon: Zap, label: "Process", description: "Async GPU jobs reconstruct the scene into a Gaussian splat." },
  { icon: Eye, label: "View", description: "Explore the result in a fast, interactive 3D viewer." },
  { icon: Pencil, label: "Edit", description: "Adjust framing, save camera shots, and build guided tours." },
];

export default function LandingPage() {
  return (
    <div className="sw-field min-h-screen">
      <MarketingHeader />

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-5 pt-16 pb-20 sm:px-8 sm:pt-24 sm:pb-28">
        <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
          <div>
            <span className="sw-control inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-[var(--nord-slate)]">
              <Sparkles className="h-3.5 w-3.5 text-[var(--nord-teal)]" />
              High-fidelity Gaussian splatting
            </span>

            <h1 className="mt-5 text-[2.5rem] leading-[1.08] font-semibold tracking-tight text-[var(--nord-ink)] sm:text-[3.25rem]">
              Turn your photos into explorable 3D worlds.
            </h1>

            <p className="mt-5 max-w-lg text-base leading-relaxed text-[var(--nord-slate)] sm:text-lg">
              Splatial is the cloud-native Gaussian splatting platform. Upload
              photos, get a photorealistic volumetric scene back, and share
              it anywhere &mdash; powered by our cloud GPUs, so no local
              hardware is required.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/scenes?authTab=signup"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "h-11 gap-2 rounded-full bg-[var(--nord-pine)] px-6 text-[15px] font-semibold text-[var(--nord-ink)] hover:bg-[var(--nord-pine)]",
                )}
              >
                Get Started
                <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
              </Link>
              <Link
                href="#how-it-works"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "h-11 rounded-full border-[var(--nord-hairline)] bg-transparent px-6 text-[15px] font-semibold text-[var(--nord-ink)] hover:bg-[var(--nord-tint)]",
                )}
              >
                See how it works
              </Link>
            </div>
          </div>

          <HeroVisual />
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-[var(--nord-hairline)]">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
          <div className="max-w-xl">
            <h2 className="text-2xl font-semibold tracking-tight text-[var(--nord-ink)] sm:text-3xl">
              Everything you need to go from photos to a scene
            </h2>
            <p className="mt-3 text-[var(--nord-slate)]">
              Splatial handles reconstruction, hosting, and delivery, so you can focus on the capture.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <div key={title} className="sw-glass-card rounded-2xl p-6">
                <span className="sw-control flex h-10 w-10 items-center justify-center rounded-xl text-[var(--nord-teal)]">
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </span>
                <h3 className="mt-4 text-[15px] font-semibold text-[var(--nord-ink)]">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--nord-slate)]">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-t border-[var(--nord-hairline)]">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
          <div className="max-w-xl">
            <h2 className="text-2xl font-semibold tracking-tight text-[var(--nord-ink)] sm:text-3xl">
              The Splatial workflow
            </h2>
            <p className="mt-3 text-[var(--nord-slate)]">Four steps, mostly handled for you.</p>
          </div>

          <div className="mt-12 grid gap-3 sm:grid-cols-4">
            {WORKFLOW_STEPS.map(({ icon: Icon, label, description }, index) => (
              <div key={label} className="relative">
                <div className="sw-glass-card flex h-full flex-col gap-3 rounded-2xl p-5">
                  <div className="flex items-center justify-between">
                    <span className="sw-control flex h-9 w-9 items-center justify-center rounded-lg text-[var(--nord-ink)]">
                      <Icon className="h-4.5 w-4.5" strokeWidth={2} />
                    </span>
                    <span className="font-sw-mono text-xs text-[var(--nord-slate-soft)]">0{index + 1}</span>
                  </div>
                  <div>
                    <h3 className="text-[14px] font-semibold text-[var(--nord-ink)]">{label}</h3>
                    <p className="mt-1 text-[13px] leading-relaxed text-[var(--nord-slate)]">{description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="border-t border-[var(--nord-hairline)]">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <div className="sw-glass-card flex flex-col items-start justify-between gap-6 rounded-2xl p-8 sm:flex-row sm:items-center sm:p-10">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-[var(--nord-ink)] sm:text-2xl">
                Ready to build your first scene?
              </h2>
              <p className="mt-2 text-sm text-[var(--nord-slate)]">
                Free to start. No GPU required.
              </p>
            </div>
            <Link
              href="/scenes?authTab=signup"
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-11 shrink-0 gap-2 rounded-full bg-[var(--nord-pine)] px-6 text-[15px] font-semibold text-[var(--nord-ink)] hover:bg-[var(--nord-pine)]",
              )}
            >
              Get Started
              <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}

/** Decorative hero graphic: a floating panel with a point-cloud style mesh and two info badges, echoing the product's own viewer without needing to mount the real WebGL viewer on the marketing page. */
function HeroVisual() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-md">
      <div className="sw-glass-card absolute inset-0 overflow-hidden rounded-3xl">
        <div
          className="absolute inset-0 opacity-90"
          style={{
            backgroundImage:
              "radial-gradient(38% 38% at 30% 28%, rgba(99,102,241,.55), transparent 65%), radial-gradient(42% 42% at 72% 62%, rgba(25,194,173,.5), transparent 65%), radial-gradient(30% 30% at 78% 20%, rgba(236,72,153,.35), transparent 65%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(1.4px 1.4px at 20% 30%, rgba(255,255,255,.9), transparent 60%), radial-gradient(1.2px 1.2px at 45% 15%, rgba(255,255,255,.8), transparent 60%), radial-gradient(1.6px 1.6px at 65% 45%, rgba(255,255,255,.85), transparent 60%), radial-gradient(1.1px 1.1px at 80% 25%, rgba(255,255,255,.75), transparent 60%), radial-gradient(1.5px 1.5px at 30% 65%, rgba(255,255,255,.8), transparent 60%), radial-gradient(1.3px 1.3px at 55% 80%, rgba(255,255,255,.75), transparent 60%), radial-gradient(1.7px 1.7px at 88% 70%, rgba(255,255,255,.8), transparent 60%), radial-gradient(1.2px 1.2px at 12% 85%, rgba(255,255,255,.7), transparent 60%)",
            backgroundSize: "180px 180px",
          }}
        />
        <span className="absolute flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--nord-tint)] text-[var(--nord-ink)] backdrop-blur-sm" style={{ top: "42%", left: "42%" }}>
          <Boxes className="h-7 w-7" strokeWidth={1.75} />
        </span>
      </div>

      <div className="sw-overlay-panel absolute -right-3 top-8 rounded-xl px-3.5 py-2.5 text-left sm:-right-6">
        <p className="text-[11px] text-[var(--nord-slate)]">Splat count</p>
        <p className="font-sw-mono text-sm font-semibold text-[var(--nord-ink)]">25.1M</p>
      </div>

      <div className="sw-overlay-panel absolute -left-3 bottom-10 rounded-xl px-3.5 py-2.5 text-left sm:-left-6">
        <p className="text-[11px] text-[var(--nord-slate)]">Render time</p>
        <p className="font-sw-mono text-sm font-semibold text-[var(--nord-teal)]">12ms</p>
      </div>
    </div>
  );
}
