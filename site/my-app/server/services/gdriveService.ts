"use client";

import { authenticatedFetch } from "@/server/services/apiClient";
import type { GdriveImportRequest, GdriveImportResponse } from "@/types/api";

export async function importFromGdrive(
  payload: GdriveImportRequest,
  signal?: AbortSignal,
): Promise<GdriveImportResponse> {
  return authenticatedFetch("/upload/from-gdrive", {
    method: "POST",
    body: JSON.stringify(payload),
    signal,
  }) as Promise<GdriveImportResponse>;
}
