"use client";

import { authenticatedFetch } from "@/services/apiClient";
import type { AccountUsageResponse } from "@/types/api";

export async function getAccountUsage(
  signal?: AbortSignal,
): Promise<AccountUsageResponse> {
  return authenticatedFetch("/api/v1/account/usage", {
    signal,
  }) as Promise<AccountUsageResponse>;
}
