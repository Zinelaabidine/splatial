/** Derive display name and initials from a Cognito email / username. */
export function parseUser(loginId: string): {
  displayName: string;
  initials: string;
} {
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
