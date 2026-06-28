"use client";

import { useEffect, useState } from "react";
import { fetchAuthSession } from "aws-amplify/auth";

const ADMIN_GROUP =
  process.env.NEXT_PUBLIC_ADMIN_GROUP_NAME?.trim() || "admin";

function extractGroups(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const raw = (payload as Record<string, unknown>)["cognito:groups"];
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map(String).map((s) => s.trim());
  return String(raw)
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Resolves whether the signed-in user belongs to the Cognito admin group.
 *
 * This is a CLIENT-SIDE gate for UX only (hide the nav link, show a friendly
 * "access denied"). The real authorization is enforced server-side in the
 * /admin/* handlers. Returns `null` while the session is still resolving.
 */
export function useIsAdmin(): boolean | null {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const session = await fetchAuthSession();
        const payload = session.tokens?.idToken?.payload;
        const groups = extractGroups(payload);
        if (active) setIsAdmin(groups.includes(ADMIN_GROUP));
      } catch {
        if (active) setIsAdmin(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return isAdmin;
}
