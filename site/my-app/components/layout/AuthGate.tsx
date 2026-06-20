"use client";

import { Authenticator, ThemeProvider, type Theme } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import React from "react";

/**
 * Minimalist theme override for the Amplify Authenticator.
 *
 * Amplify UI v6 is themed via design tokens (CSS variables). We override the
 * subset that controls the "AWS-y" look (orange accents, heavy borders, big
 * box shadow) so the sign-in card matches our light, slate-on-white shell.
 *
 * Anything not covered by tokens is patched via plain Tailwind classes in
 * `globals.css` under `[data-amplify-authenticator]`.
 */
const minimalTheme: Theme = {
  name: "splatial-minimal",
  tokens: {
    colors: {
      brand: {
        primary: {
          10: { value: "#eef2ff" },
          20: { value: "#e0e7ff" },
          40: { value: "#a5b4fc" },
          60: { value: "#6366f1" },
          80: { value: "#4f46e5" },
          90: { value: "#4338ca" },
          100: { value: "#3730a3" },
        },
      },
      font: {
        interactive: { value: "#4f46e5" },
        primary: { value: "#0f172a" },
        secondary: { value: "#475569" },
      },
      background: {
        primary: { value: "#ffffff" },
        secondary: { value: "#f8fafc" },
      },
      border: {
        primary: { value: "#e2e8f0" },
        secondary: { value: "#f1f5f9" },
        focus: { value: "#6366f1" },
      },
    },
    radii: {
      small: { value: "0.5rem" },
      medium: { value: "0.75rem" },
      large: { value: "1rem" },
    },
    shadows: {
      small: { value: "0 1px 2px rgba(15, 23, 42, 0.04)" },
      medium: { value: "0 4px 12px rgba(15, 23, 42, 0.06)" },
      large: { value: "0 12px 32px rgba(15, 23, 42, 0.08)" },
    },
    components: {
      authenticator: {
        router: {
          borderColor: { value: "{colors.border.secondary.value}" },
          boxShadow: { value: "{shadows.medium.value}" },
        },
      },
      button: {
        primary: {
          backgroundColor: { value: "{colors.brand.primary.80.value}" },
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
          boxShadow: { value: "0 0 0 3px rgba(99, 102, 241, 0.18)" },
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

/**
 * Wraps the application in an Amplify <Authenticator>. When the user is not
 * signed in, the Authenticator renders its own login/signup card. When signed
 * in, `children` is rendered with full access to `useAuthenticator()` for
 * `signOut` and `user`.
 */
export default function AuthGate({ children }: AuthGateProps) {
  return (
    <ThemeProvider theme={minimalTheme}>
      <div className="auth-gate min-h-screen w-full antialiased">
        <Authenticator signUpAttributes={["email"]} loginMechanisms={["email"]}>
          {() => <>{children}</>}
        </Authenticator>
      </div>
    </ThemeProvider>
  );
}
