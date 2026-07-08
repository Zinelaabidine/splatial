/**
 * User profile API contract (GET/PUT /api/v1/profile/me, etc.)
 */

/** Per-notification-type "email me" toggle. Defaults to true for every type. */
export type NotifyEmailPrefs = {
  follow: boolean;
  reaction: boolean;
  comment: boolean;
  mention: boolean;
  jobStatus: boolean;
};

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
  /** Present on GET /api/v1/profiles/{username} when viewing another user. */
  isFollowing?: boolean;
  /** True when the authenticated viewer is the profile owner. */
  isSelf?: boolean;
  /** Self-only fields — present only on GET/PUT /api/v1/profile/me. */
  email?: string | null;
  notifyEmail?: NotifyEmailPrefs;
  defaultVisibility?: "PUBLIC" | "PRIVATE";
};

export type FollowResponse = {
  following: boolean;
  followersCount: number;
};

export type UpdateProfileRequest = {
  username?: string;
  displayName?: string;
  bio?: string;
  notifyEmail?: Partial<NotifyEmailPrefs>;
  defaultVisibility?: "PUBLIC" | "PRIVATE";
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
