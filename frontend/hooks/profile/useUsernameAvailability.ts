"use client";

import { useEffect, useMemo, useState } from "react";

import { checkUsernameAvailable } from "@/services/profileService";
import {
  isValidUsernameFormat,
  normalizeUsernameInput,
} from "@/types/profile";

export type UsernameAvailability =
  | "idle"
  | "checking"
  | "available"
  | "taken"
  | "invalid"
  | "unchanged";

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

export function useUsernameAvailability(
  username: string,
  currentUsername?: string | null,
): UsernameAvailability {
  const normalized = normalizeUsernameInput(username);
  const debounced = useDebouncedValue(normalized, 350);
  const [lookup, setLookup] = useState<"idle" | "available" | "taken">("idle");

  const syncStatus = useMemo((): UsernameAvailability | "pending" => {
    if (!normalized) return "idle";
    if (normalized === (currentUsername ?? "")) return "unchanged";
    if (!isValidUsernameFormat(normalized)) return "invalid";
    return "pending";
  }, [normalized, currentUsername]);

  const needsLookup = syncStatus === "pending" && debounced === normalized;

  useEffect(() => {
    if (!needsLookup) return;

    let cancelled = false;
    const controller = new AbortController();

    checkUsernameAvailable(debounced, controller.signal)
      .then((result) => {
        if (!cancelled) {
          setLookup(result.available ? "available" : "taken");
        }
      })
      .catch(() => {
        if (!cancelled) setLookup("idle");
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [needsLookup, debounced]);

  if (syncStatus !== "pending") return syncStatus;
  if (debounced !== normalized) return "checking";
  if (lookup === "idle") return "checking";
  return lookup;
}
