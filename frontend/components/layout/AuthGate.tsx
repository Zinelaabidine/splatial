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
import React, { Suspense, useSyncExternalStore } from "react";

import BrandMark from "@/components/marketing/BrandMark";

/**
 * Nordic light theme override for the Amplify Authenticator, matching the
 * warm-ivory / pine-and-teal palette used across the marketing site and the
 * app shell, instead of Amplify's default light/AWS-orange look.
 */
const minimalTheme: Theme = {
  name: "splatial-nordic",
  tokens: {
    colors: {
      brand: {
        primary: {
          10: { value: "#e7ede9" },
          20: { value: "#cfdcd4" },
          40: { value: "#4e827c" },
          60: { value: "#3f6b66" },
          80: { value: "#23433a" },
          90: { value: "#1c382f" },
          100: { value: "#14261f" },
        },
      },
      font: {
        interactive: { value: "#23433a" },
        primary: { value: "#1c1f21" },
        secondary: { value: "#45494c" },
      },
      background: {
        primary: { value: "#fefefd" },
        secondary: { value: "#fbfaf8" },
      },
      border: {
        primary: { value: "rgba(52, 56, 59, 0.14)" },
        secondary: { value: "rgba(52, 56, 59, 0.10)" },
        focus: { value: "#4e827c" },
      },
    },
    radii: {
      small: { value: "0.5rem" },
      medium: { value: "0.75rem" },
      large: { value: "1rem" },
    },
    shadows: {
      small: { value: "0 1px 2px rgba(43, 42, 38, 0.06)" },
      medium: { value: "0 4px 12px rgba(43, 42, 38, 0.08)" },
      large: { value: "0 12px 32px rgba(43, 42, 38, 0.10)" },
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
          color: { value: "#f4f2ec" },
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
          boxShadow: { value: "0 0 0 3px rgba(78, 130, 124, 0.18)" },
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
  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // Amplify resolves cached Cognito sessions on the client only, so authStatus
  // is always "configuring" during SSR while the client may already be
  // "authenticated". Defer auth-dependent UI until after hydration so the
  // first client paint matches the server HTML.
  if (!isHydrated || authStatus === "configuring") {
    return (
      <div className="auth-gate flex min-h-screen w-full items-center justify-center bg-[var(--nord-bg)] antialiased">
        <AuthFallback />
      </div>
    );
  }

  if (authStatus === "authenticated") {
    return <>{children}</>;
  }

  return (
    <div className="auth-gate min-h-screen w-full bg-[var(--nord-bg)] antialiased">
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
            <div className="auth-gate flex min-h-screen w-full items-center justify-center bg-[var(--nord-bg)] antialiased">
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
    <div className="w-full max-w-sm animate-pulse rounded-2xl border border-[var(--nord-hairline)] bg-[var(--nord-bg)] p-8">
      <div className="h-5 w-32 rounded bg-[var(--nord-tint)]" />
      <div className="mt-6 h-10 w-full rounded bg-[var(--nord-tint)]" />
      <div className="mt-3 h-10 w-full rounded bg-[var(--nord-tint)]" />
      <div className="mt-6 h-10 w-full rounded bg-[var(--nord-tint)]" />
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
    <div className="relative hidden overflow-hidden border-l border-[var(--nord-hairline)] lg:block">
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: "#eee9e0",
          backgroundImage:
            "linear-gradient(rgba(52,56,59,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(52,56,59,0.05) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div
        className="absolute inset-0 opacity-80"
        style={{
          backgroundImage:
            "radial-gradient(45% 45% at 30% 30%, rgba(78,130,124,.20), transparent 65%), radial-gradient(40% 40% at 75% 65%, rgba(35,67,58,.16), transparent 65%)",
        }}
      />

      <div className="relative flex h-full flex-col items-center justify-center gap-8 px-12 text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-3xl border border-[var(--nord-hairline)] bg-[var(--nord-tint)] text-[var(--nord-teal)] backdrop-blur-sm">
          <Boxes className="h-9 w-9" strokeWidth={1.5} />
        </span>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-[var(--nord-ink)]">
            Fast cloud rendering, editable 3D scenes.
          </h2>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-[var(--nord-slate)]">
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
          <p className="text-[11px] text-[var(--nord-slate)]">{badge.label}</p>
          <p className="font-sw-mono text-sm font-semibold text-[var(--nord-ink)]">{badge.value}</p>
        </div>
      ))}
    </div>
  );
}
