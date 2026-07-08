"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

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
import type { NotifyEmailPrefs } from "@/types/profile";

const NOTIFY_EMAIL_LABELS: Record<keyof NotifyEmailPrefs, string> = {
  follow: "Someone follows you",
  reaction: "Someone reacts to your scene or comment",
  comment: "Someone comments on your scene",
  mention: "Someone mentions you in a comment",
  jobStatus: "A training job finishes or fails",
};

const DEFAULT_NOTIFY_EMAIL: NotifyEmailPrefs = {
  follow: true,
  reaction: true,
  comment: true,
  mention: true,
  jobStatus: true,
};

export default function ProfileSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const availability = useUsernameAvailability(username, profile?.username);

  const [notifyEmail, setNotifyEmail] = useState<NotifyEmailPrefs>(DEFAULT_NOTIFY_EMAIL);
  const [notifySaving, setNotifySaving] = useState<keyof NotifyEmailPrefs | null>(null);
  const [notifyError, setNotifyError] = useState<string | null>(null);

  const [defaultVisibility, setDefaultVisibility] = useState<"PUBLIC" | "PRIVATE">("PRIVATE");
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [visibilityError, setVisibilityError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    getMyProfile(controller.signal)
      .then((loaded) => {
        if (cancelled) return;
        setProfile(loaded);
        setUsername(loaded.username ?? "");
        setDisplayName(loaded.displayName);
        setBio(loaded.bio);
        if (loaded.notifyEmail) setNotifyEmail(loaded.notifyEmail);
        if (loaded.defaultVisibility) setDefaultVisibility(loaded.defaultVisibility);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load profile");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const handleSave = useCallback(async () => {
    setSaveError(null);
    setSaveSuccess(false);

    const normalized = normalizeUsernameInput(username);
    const payload: {
      username?: string;
      displayName?: string;
      bio?: string;
    } = {};

    if (normalized !== (profile?.username ?? "")) {
      if (!isValidUsernameFormat(normalized)) {
        setSaveError(`Invalid username. ${USERNAME_HINT}.`);
        return;
      }
      if (availability !== "available") {
        setSaveError("Choose an available username before saving.");
        return;
      }
      payload.username = normalized;
    }

    const trimmedDisplay = displayName.trim();
    if (trimmedDisplay !== (profile?.displayName ?? "")) {
      if (!trimmedDisplay) {
        setSaveError("Display name cannot be empty.");
        return;
      }
      payload.displayName = trimmedDisplay;
    }

    const trimmedBio = bio.trim();
    if (trimmedBio !== (profile?.bio ?? "")) {
      payload.bio = trimmedBio;
    }

    if (Object.keys(payload).length === 0) {
      setSaveError("No changes to save.");
      return;
    }

    setSaving(true);
    try {
      const updated = await updateMyProfile(payload);
      setProfile(updated);
      setUsername(updated.username ?? "");
      setDisplayName(updated.displayName);
      setBio(updated.bio);
      setSaveSuccess(true);
    } catch (err) {
      const message =
        err instanceof ApiRequestError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Save failed";
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  }, [availability, bio, displayName, profile, username]);

  const handleNotifyEmailToggle = useCallback(
    async (key: keyof NotifyEmailPrefs, value: boolean) => {
      const previous = notifyEmail;
      setNotifyEmail((prev) => ({ ...prev, [key]: value }));
      setNotifySaving(key);
      setNotifyError(null);
      try {
        const updated = await updateMyProfile({ notifyEmail: { [key]: value } });
        if (updated.notifyEmail) setNotifyEmail(updated.notifyEmail);
      } catch (err) {
        setNotifyEmail(previous);
        setNotifyError(
          err instanceof ApiRequestError || err instanceof Error
            ? err.message
            : "Could not update notification preference.",
        );
      } finally {
        setNotifySaving(null);
      }
    },
    [notifyEmail],
  );

  const handleDefaultVisibilityChange = useCallback(
    async (value: "PUBLIC" | "PRIVATE") => {
      const previous = defaultVisibility;
      setDefaultVisibility(value);
      setVisibilitySaving(true);
      setVisibilityError(null);
      try {
        const updated = await updateMyProfile({ defaultVisibility: value });
        if (updated.defaultVisibility) setDefaultVisibility(updated.defaultVisibility);
      } catch (err) {
        setDefaultVisibility(previous);
        setVisibilityError(
          err instanceof ApiRequestError || err instanceof Error
            ? err.message
            : "Could not update default visibility.",
        );
      } finally {
        setVisibilitySaving(false);
      }
    },
    [defaultVisibility],
  );

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#909090]" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl py-8 text-center text-red-400">
        {loadError}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 text-2xl font-semibold text-white">Profile settings</h1>
      <p className="mb-8 text-sm text-[#909090]">
        Update your public handle and profile details.
      </p>

      {profile?.username ? (
        <p className="mb-8">
          <Link
            href={`/u/${profile.username}`}
            className="text-sm text-[#3b82f6] hover:underline"
          >
            View my public profile
          </Link>
        </p>
      ) : null}

      <div className="space-y-5 rounded-2xl border border-[#303030] bg-[#0f0f0f] p-6">
        <div>
          <label
            htmlFor="profile-username"
            className="mb-1.5 block text-sm font-medium text-[#e8e8e8]"
          >
            Username
          </label>
          <input
            id="profile-username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            className="h-10 w-full rounded-lg border border-[#404040] bg-[#1a1a1a] px-3 text-sm text-white outline-none transition focus:border-[#3b82f6] focus:ring-2 focus:ring-[#3b82f6]/30"
          />
          <p className="mt-1 text-xs text-[#606060]">{USERNAME_HINT}</p>
          {availability === "checking" && (
            <p className="mt-1 text-xs text-[#909090]">Checking availability…</p>
          )}
          {availability === "available" && (
            <p className="mt-1 text-xs text-green-400">Username is available</p>
          )}
          {availability === "taken" && (
            <p className="mt-1 text-xs text-red-400">Username is taken</p>
          )}
          {availability === "invalid" && username.trim() !== "" && (
            <p className="mt-1 text-xs text-red-400">{USERNAME_HINT}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="profile-display-name"
            className="mb-1.5 block text-sm font-medium text-[#e8e8e8]"
          >
            Display name
          </label>
          <input
            id="profile-display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={50}
            className="h-10 w-full rounded-lg border border-[#404040] bg-[#1a1a1a] px-3 text-sm text-white outline-none transition focus:border-[#3b82f6] focus:ring-2 focus:ring-[#3b82f6]/30"
          />
        </div>

        <div>
          <label
            htmlFor="profile-bio"
            className="mb-1.5 block text-sm font-medium text-[#e8e8e8]"
          >
            Bio
          </label>
          <textarea
            id="profile-bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={280}
            rows={4}
            className="w-full resize-y rounded-lg border border-[#404040] bg-[#1a1a1a] px-3 py-2 text-sm text-white outline-none transition focus:border-[#3b82f6] focus:ring-2 focus:ring-[#3b82f6]/30"
          />
          <p className="mt-1 text-xs text-[#606060]">{bio.length}/280</p>
        </div>

        <div className="flex items-center justify-between border-t border-[#303030] pt-4">
          <div>
            {saveSuccess && (
              <p className="text-sm text-green-400">Profile saved.</p>
            )}
            {saveError && <p className="text-sm text-red-400">{saveError}</p>}
          </div>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="animate-spin" />
                Saving…
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </div>
      </div>

      <div className="mt-6 space-y-5 rounded-2xl border border-[#303030] bg-[#0f0f0f] p-6">
        <div>
          <h2 className="text-base font-semibold text-white">Email notifications</h2>
          <p className="mt-1 text-xs text-[#909090]">
            {profile?.email
              ? `Sent to ${profile.email}.`
              : "Sign in again to link an email address for notifications."}{" "}
            All are on by default.
          </p>
        </div>
        <div className="space-y-3">
          {(Object.keys(NOTIFY_EMAIL_LABELS) as (keyof NotifyEmailPrefs)[]).map((key) => (
            <label
              key={key}
              className="flex items-center justify-between gap-3 text-sm text-[#e8e8e8]"
            >
              <span>{NOTIFY_EMAIL_LABELS[key]}</span>
              <input
                type="checkbox"
                checked={notifyEmail[key]}
                disabled={notifySaving === key}
                onChange={(e) => void handleNotifyEmailToggle(key, e.target.checked)}
                aria-label={NOTIFY_EMAIL_LABELS[key]}
                className="h-4 w-4 shrink-0 cursor-pointer rounded border border-[#404040] bg-[#1a1a1a] accent-[#3b82f6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6]/50 disabled:opacity-50"
              />
            </label>
          ))}
        </div>
        {notifyError && <p className="text-sm text-red-400">{notifyError}</p>}
      </div>

      <div className="mt-6 space-y-4 rounded-2xl border border-[#303030] bg-[#0f0f0f] p-6">
        <div>
          <h2 className="text-base font-semibold text-white">Privacy</h2>
          <p className="mt-1 text-xs text-[#909090]">
            Default visibility applied to newly created scenes. You can still change it per scene.
          </p>
        </div>
        <div className="flex gap-3">
          {(["PRIVATE", "PUBLIC"] as const).map((option) => (
            <label
              key={option}
              className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                defaultVisibility === option
                  ? "border-[#3b82f6] bg-[#3b82f6]/10 text-white"
                  : "border-[#404040] text-[#a0a0aa] hover:bg-[#1a1a1a]"
              }`}
            >
              <input
                type="radio"
                name="default-visibility"
                value={option}
                checked={defaultVisibility === option}
                disabled={visibilitySaving}
                onChange={() => void handleDefaultVisibilityChange(option)}
                className="sr-only"
              />
              {option === "PRIVATE" ? "Private" : "Public"}
            </label>
          ))}
        </div>
        {visibilityError && <p className="text-sm text-red-400">{visibilityError}</p>}
      </div>
    </div>
  );
}
