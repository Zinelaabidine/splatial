"use client";

import {
  Authenticator,
  ThemeProvider,
  useAuthenticator,
  type Theme,
} from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import { useSearchParams } from "next/navigation";
import { Boxes } from "lucide-react";
import React, { Suspense } from "react";

import BrandMark from "@/components/marketing/BrandMark";

/**
 * Dark theme override for the Amplify Authenticator, matching the
 * `sw-glass` graphite palette used across the marketing site and the app
 * shell (teal accent, near-black surfaces) instead of Amplify's default
 * light/AWS-orange look.
 */
const minimalTheme: Theme = {
  name: "splatial-dark",
  tokens: {
    colors: {
      brand: {
        primary: {
          10: { value: "#0d2622" },
          20: { value: "#123a33" },
          40: { value: "#19c2ad" },
          60: { value: "#19c2ad" },
          80: { value: "#19c2ad" },
          90: { value: "#22d6bf" },
          100: { value: "#7eead9" },
        },
      },
      font: {
        interactive: { value: "#19c2ad" },
        primary: { value: "#f4f4f5" },
        secondary: { value: "#a4a4ae" },
      },
      background: {
        primary: { value: "#131316" },
        secondary: { value: "#0c0c0e" },
      },
      border: {
        primary: { value: "rgba(255, 255, 255, 0.12)" },
        secondary: { value: "rgba(255, 255, 255, 0.08)" },
        focus: { value: "#19c2ad" },
      },
    },
    radii: {
      small: { value: "0.5rem" },
      medium: { value: "0.75rem" },
      large: { value: "1rem" },
    },
    shadows: {
      small: { value: "0 1px 2px rgba(0, 0, 0, 0.3)" },
      medium: { value: "0 4px 12px rgba(0, 0, 0, 0.35)" },
      large: { value: "0 12px 32px rgba(0, 0, 0, 0.45)" },
    },
    components: {
      authenticator: {
        router: {
          borderColor: { value: "{colors.border.secondary.value}" },
          boxShadow: { value: "{shadows.large.value}" },
        },
      },
      button: {
        primary: {
          backgroundColor: { value: "{colors.brand.primary.80.value}" },
          color: { value: "#08110f" },
          _hover: {
            backgroundColor: { value: "{colors.brand.primary.90.value}" },
          },
          _focus: {
            backgroundColor: { value: "{colors.brand.primary.90.value}" },
          },
        },
        link: {
          color: { value: "{colors.brand.primary.80.value}" },
          _hover: {
            color: { value: "{colors.brand.primary.90.value}" },
            backgroundColor: { value: "transparent" },
          },
        },
      },
      fieldcontrol: {
        borderColor: { value: "{colors.border.primary.value}" },
        _focus: {
          borderColor: { value: "{colors.brand.primary.60.value}" },
          boxShadow: { value: "0 0 0 3px rgba(25, 194, 173, 0.18)" },
        },
      },
      tabs: {
        item: {
          color: { value: "{colors.font.secondary.value}" },
          _hover: { color: { value: "{colors.font.primary.value}" } },
          _active: {
            color: { value: "{colors.brand.primary.80.value}" },
            borderColor: { value: "{colors.brand.primary.80.value}" },
          },
        },
      },
    },
  },
};

interface AuthGateProps {
  children: React.ReactNode;
}

/** Reads `?authTab=signup` so the marketing site's "Get Started" and "Log in"
 * buttons can land on the right tab of the same Authenticator. Isolated into
 * its own component so `useSearchParams` doesn't force the whole gate out of
 * static rendering — only this leaf needs a Suspense boundary. */
function AuthGateRouter({ children }: AuthGateProps) {
  const searchParams = useSearchParams();
  const initialState = searchParams.get("authTab") === "signup" ? "signUp" : "signIn";
  const { authStatus } = useAuthenticator((ctx) => [ctx.authStatus]);

  if (authStatus === "configuring") {
    return (
      <div className="auth-gate flex min-h-screen w-full items-center justify-center bg-[#0c0c0e] antialiased">
        <AuthFallback />
      </div>
    );
  }

  if (authStatus === "authenticated") {
    return <>{children}</>;
  }

  return (
    <div className="auth-gate min-h-screen w-full bg-[#0c0c0e] antialiased">
      <div className="grid min-h-screen lg:grid-cols-2">
        <div className="flex flex-col px-5 py-6 sm:px-8">
          <BrandMark />
          <div className="flex flex-1 items-center justify-center py-10">
            <Authenticator
              initialState={initialState}
              signUpAttributes={["email", "preferred_username"]}
              loginMechanisms={["email"]}
              formFields={{
                signUp: {
                  preferred_username: {
                    label: "Username",
                    placeholder: "your_handle (a-z, 0-9, _)",
                    isRequired: true,
                    order: 2,
                  },
                  email: {
                    order: 1,
                  },
                },
              }}
            />
          </div>
        </div>

        <LoginVisualPanel />
      </div>
    </div>
  );
}

/**
 * Wraps the application in an Amplify <Authenticator>. When the user is not
 * signed in, a dark split-screen shell renders: the sign-in/sign-up card on
 * the left, a branded visual panel on the right (hidden below `lg`). When
 * signed in, `children` is rendered with full access to `useAuthenticator()`.
 */
export default function AuthGate({ children }: AuthGateProps) {
  return (
    <ThemeProvider theme={minimalTheme}>
      <Authenticator.Provider>
        <Suspense
          fallback={
            <div className="auth-gate flex min-h-screen w-full items-center justify-center bg-[#0c0c0e] antialiased">
              <AuthFallback />
            </div>
          }
        >
          <AuthGateRouter>{children}</AuthGateRouter>
        </Suspense>
      </Authenticator.Provider>
    </ThemeProvider>
  );
}

function AuthFallback() {
  return (
    <div className="w-full max-w-sm animate-pulse rounded-2xl border border-white/8 bg-[#131316] p-8">
      <div className="h-5 w-32 rounded bg-white/10" />
      <div className="mt-6 h-10 w-full rounded bg-white/5" />
      <div className="mt-3 h-10 w-full rounded bg-white/5" />
      <div className="mt-6 h-10 w-full rounded bg-white/10" />
    </div>
  );
}

const LOGIN_BADGES = [
  { label: "Splat count", value: "25.1M", top: "14%", left: "8%" },
  { label: "Render time", value: "12ms", top: "68%", left: "4%" },
  { label: "Quality", value: "Ultra", top: "22%", left: "72%" },
  { label: "Job status", value: "Complete", top: "76%", left: "58%" },
];

/** Decorative right-hand panel for the login shell: a dark grid backdrop,
 * a soft mesh/point-cloud graphic, and a few floating stat badges echoing
 * the in-app viewer, without mounting the real WebGL viewer here. */
function LoginVisualPanel() {
  return (
    <div className="relative hidden overflow-hidden border-l border-white/8 lg:block">
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: "#0a0a0c",
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div
        className="absolute inset-0 opacity-80"
        style={{
          backgroundImage:
            "radial-gradient(45% 45% at 30% 30%, rgba(25,194,173,.28), transparent 65%), radial-gradient(40% 40% at 75% 65%, rgba(99,102,241,.24), transparent 65%)",
        }}
      />

      <div className="relative flex h-full flex-col items-center justify-center gap-8 px-12 text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-3xl border border-white/10 bg-white/5 text-[#7eead9] backdrop-blur-sm">
          <Boxes className="h-9 w-9" strokeWidth={1.5} />
        </span>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-white">
            Fast cloud rendering, editable 3D scenes.
          </h2>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-[#a4a4ae]">
            Sign in to pick up your scenes, tours, and shots right where you left them.
          </p>
        </div>
      </div>

      {LOGIN_BADGES.map((badge) => (
        <div
          key={badge.label}
          className="sw-overlay-panel absolute rounded-xl px-3.5 py-2.5 text-left"
          style={{ top: badge.top, left: badge.left }}
        >
          <p className="text-[11px] text-[#9a9aa4]">{badge.label}</p>
          <p className="font-sw-mono text-sm font-semibold text-white">{badge.value}</p>
        </div>
      ))}
    </div>
  );
}
