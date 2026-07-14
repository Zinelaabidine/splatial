"use client";

import { Authenticator, useAuthenticator } from "@aws-amplify/ui-react";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

import LandingPage from "@/components/marketing/LandingPage";

function LandingPageGateInner() {
  const router = useRouter();
  const { authStatus } = useAuthenticator((ctx) => [ctx.authStatus]);
  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(() => {
    if (isHydrated && authStatus === "authenticated") {
      router.replace("/scenes");
    }
  }, [authStatus, isHydrated, router]);

  if (!isHydrated || authStatus === "configuring") {
    return (
      <div className="sw-field flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-pulse rounded-full bg-[var(--nord-tint)]" />
      </div>
    );
  }

  if (authStatus === "authenticated") {
    return null;
  }

  return <LandingPage />;
}

/** Public landing page — redirects signed-in users to the app home. */
export default function LandingPageGate() {
  return (
    <Authenticator.Provider>
      <LandingPageGateInner />
    </Authenticator.Provider>
  );
}
