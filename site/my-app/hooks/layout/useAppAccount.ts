"use client";

import { useAuthenticator } from "@aws-amplify/ui-react";

import { MOCK_ACCOUNT } from "@/fixtures/mockSplats";
import { parseUser } from "@/lib/auth/parseUser";
import type { UserAccount } from "@/types/splatworks";

export function useAppAccount(): UserAccount {
  const { user } = useAuthenticator((ctx) => [ctx.user]);
  const email =
    (user?.signInDetails?.loginId as string | undefined) ??
    user?.username ??
    "";

  if (!email) return MOCK_ACCOUNT;

  const { displayName, initials } = parseUser(email);
  return {
    name: displayName,
    initials,
    plan: "Pro plan",
  };
}
