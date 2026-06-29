"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { fetchUserAttributes } from "aws-amplify/auth";
import { Loader2 } from "lucide-react";

import AppShell from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { useUsernameAvailability } from "@/hooks/profile/useUsernameAvailability";
import { ApiRequestError } from "@/lib/api/apiErrors";
import {
  getMyProfile,
  updateMyProfile,
} from "@/services/profileService";
import type { Profile } from "@/types/api";
import {
  USERNAME_HINT,
  isValidUsernameFormat,
  normalizeUsernameInput,
} from "@/types/profile";

const ONBOARDING_PATH = "/onboarding";

type ProfileOnboardingGateProps = {
  children: ReactNode;
};

export default function ProfileOnboardingGate({
  children,
}: ProfileOnboardingGateProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    getMyProfile(controller.signal)
      .then((loaded) => {
        if (!cancelled) setProfile(loaded);
      })
      .catch((err) => {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Failed to load profile";
        setError(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (loading || !profile) return;

    const onOnboarding = pathname === ONBOARDING_PATH;

    if (!profile.username && !onOnboarding) {
      router.replace(ONBOARDING_PATH);
      return;
    }

    if (profile.username && onOnboarding) {
      router.replace("/scenes");
    }
  }, [loading, profile, pathname, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#121212]">
        <Loader2 className="h-8 w-8 animate-spin text-[#909090]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#121212] px-6 text-center">
        <p className="text-sm text-red-400">{error}</p>
        <Button
          variant="outline"
          onClick={() => {
            setLoading(true);
            setError(null);
            getMyProfile()
              .then(setProfile)
              .catch((err) =>
                setError(err instanceof Error ? err.message : "Failed to load profile"),
              )
              .finally(() => setLoading(false));
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  const onOnboarding = pathname === ONBOARDING_PATH;
  const needsOnboarding = !profile?.username;

  if (needsOnboarding) {
    if (!onOnboarding) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#121212]">
          <Loader2 className="h-8 w-8 animate-spin text-[#909090]" />
        </div>
      );
    }
    return <OnboardingPage onComplete={setProfile} />;
  }

  if (onOnboarding) {
    return null;
  }

  return <AppShell>{children}</AppShell>;
}

type OnboardingPageProps = {
  onComplete: (profile: Profile) => void;
};

function OnboardingPage({ onComplete }: OnboardingPageProps) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const availability = useUsernameAvailability(username);

  useEffect(() => {
    let cancelled = false;
    fetchUserAttributes()
      .then((attrs) => {
        if (cancelled) return;
        const preferred = attrs.preferred_username?.trim();
        if (preferred) {
          setUsername(preferred.toLowerCase());
        }
        const name = attrs.name?.trim();
        if (name) {
          setDisplayName(name);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    const normalized = normalizeUsernameInput(username);
    if (!isValidUsernameFormat(normalized)) {
      setSubmitError(`Invalid username. ${USERNAME_HINT}.`);
      return;
    }
    if (availability !== "available") {
      setSubmitError("Choose an available username before continuing.");
      return;
    }

    setSubmitting(true);
    try {
      const updated = await updateMyProfile({
        username: normalized,
        ...(displayName.trim()
          ? { displayName: displayName.trim() }
          : {}),
      });
      onComplete(updated);
    } catch (err) {
      const message =
        err instanceof ApiRequestError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not claim username";
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#121212] px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-[#303030] bg-[#0f0f0f] p-8 shadow-xl">
        <h1 className="text-2xl font-semibold text-white">Choose your username</h1>
        <p className="mt-2 text-sm text-[#909090]">
          Your handle is public and unique across Splatial. {USERNAME_HINT}.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label
              htmlFor="onboarding-username"
              className="mb-1.5 block text-sm font-medium text-[#e8e8e8]"
            >
              Username
            </label>
            <input
              id="onboarding-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              className="h-10 w-full rounded-lg border border-[#404040] bg-[#1a1a1a] px-3 text-sm text-white outline-none transition focus:border-[#3b82f6] focus:ring-2 focus:ring-[#3b82f6]/30"
              required
            />
            {availability === "checking" && (
              <p className="mt-1.5 text-xs text-[#909090]">Checking availability…</p>
            )}
            {availability === "available" && (
              <p className="mt-1.5 text-xs text-green-400">Username is available</p>
            )}
            {availability === "taken" && (
              <p className="mt-1.5 text-xs text-red-400">Username is taken</p>
            )}
            {availability === "invalid" && username.trim() !== "" && (
              <p className="mt-1.5 text-xs text-red-400">{USERNAME_HINT}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="onboarding-display-name"
              className="mb-1.5 block text-sm font-medium text-[#e8e8e8]"
            >
              Display name{" "}
              <span className="font-normal text-[#606060]">(optional)</span>
            </label>
            <input
              id="onboarding-display-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="h-10 w-full rounded-lg border border-[#404040] bg-[#1a1a1a] px-3 text-sm text-white outline-none transition focus:border-[#3b82f6] focus:ring-2 focus:ring-[#3b82f6]/30"
            />
          </div>

          {submitError && (
            <p className="text-sm text-red-400">{submitError}</p>
          )}

          <Button
            type="submit"
            disabled={
              submitting ||
              availability !== "available" ||
              !isValidUsernameFormat(normalizeUsernameInput(username))
            }
            className="h-10 w-full"
          >
            {submitting ? "Saving…" : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
