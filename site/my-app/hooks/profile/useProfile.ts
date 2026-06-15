"use client";

import { useEffect, useState } from "react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import {
  fetchUserAttributes,
  updateUserAttributes,
} from "aws-amplify/auth";

/** Derive display name and 2-letter initials from a Cognito email / username. */
function parseUser(loginId: string): { displayName: string; initials: string } {
  const local = loginId.split("@")[0] ?? loginId;
  const parts = local.split(/[._-]/).filter(Boolean);
  const displayName =
    parts.length >= 2
      ? `${parts[0][0].toUpperCase()}${parts[0].slice(1)} ${parts[parts.length - 1][0].toUpperCase()}${parts[parts.length - 1].slice(1)}`
      : local.charAt(0).toUpperCase() + local.slice(1);
  const initials = parts
    .map((p) => p[0].toUpperCase())
    .slice(0, 2)
    .join("");
  return { displayName, initials: initials || "?" };
}

export function useProfile() {
  const { user } = useAuthenticator((ctx) => [ctx.user]);
  const email =
    (user?.signInDetails?.loginId as string | undefined) ??
    user?.username ??
    "";
  const { initials: fallbackInitials } = parseUser(email);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  const initials = fullName
    ? fullName
        .split(" ")
        .map((w) => w[0]?.toUpperCase() ?? "")
        .slice(0, 2)
        .join("")
    : fallbackInitials;

  useEffect(() => {
    let cancelled = false;
    fetchUserAttributes()
      .then((attrs) => {
        if (cancelled) return;
        setFullName(attrs.name ?? parseUser(email).displayName);
        setPhone(attrs.phone_number ?? "");
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [email]);

  async function handleSave() {
    setSaving(true);
    setSaveSuccess(false);
    setSaveError(null);
    try {
      await updateUserAttributes({
        userAttributes: {
          name: fullName,
          ...(phone ? { phone_number: phone } : {}),
        },
      });
      setSaveSuccess(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return {
    email,
    loading,
    saving,
    saveSuccess,
    saveError,
    fullName,
    setFullName,
    phone,
    setPhone,
    initials,
    handleSave,
  };
}
