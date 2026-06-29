/**
 * User profile API contract (GET/PUT /api/v1/profile/me, etc.)
 */

export type Profile = {
  userId: string;
  username: string | null;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  followersCount: number;
  followingCount: number;
  scenesCount: number;
  createdAt: string;
};

export type UpdateProfileRequest = {
  username?: string;
  displayName?: string;
  bio?: string;
};

export type UpdateProfileResponse = Profile;

export type UsernameAvailableResponse = {
  available: boolean;
};

export const USERNAME_HINT = "3–20 characters, lowercase letters, numbers, and underscores only";

export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export function normalizeUsernameInput(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidUsernameFormat(raw: string): boolean {
  return USERNAME_PATTERN.test(normalizeUsernameInput(raw));
}
