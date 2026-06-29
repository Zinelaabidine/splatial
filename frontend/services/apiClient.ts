"use client";

import { fetchAuthSession } from "aws-amplify/auth";

import { getApiBaseUrl } from "@/api/baseUrl";
import {
  ApiRequestError,
  isAbortError,
  isExpectedSceneConflict,
  isTransientNetworkError,
} from "@/lib/api/apiErrors";

/**
 * Secure fetch wrapper that injects the Cognito JWT and handles silent refresh.
 */
export async function authenticatedFetch(
  endpoint: string,
  options: RequestInit = {},
) {
  try {
    const session = await fetchAuthSession();
    const jwtToken = session.tokens?.idToken?.toString();

    if (!jwtToken) {
      throw new Error("No active session or valid JWT token found.");
    }

    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${jwtToken}`);
    if (
      options.body != null &&
      options.body !== "" &&
      !headers.has("Content-Type")
    ) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let message = `${response.status} - ${response.statusText}`;
      try {
        const body = await response.json();
        if (body?.error) message = body.error;
      } catch {
        /* non-JSON body, keep default */
      }
      throw new ApiRequestError(message, response.status);
    }

    return await response.json();
  } catch (error) {
    const signal = options.signal ?? null;
    if (isAbortError(error, signal)) {
      throw error;
    }
    if (
      !isExpectedSceneConflict(error) &&
      !(process.env.NODE_ENV === "development" && isTransientNetworkError(error))
    ) {
      console.error("Authenticated API call failed:", error);
    }
    throw error;
  }
}
