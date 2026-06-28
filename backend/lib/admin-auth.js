"use strict";

/**
 * Admin authorization helper for the HTTP API (API Gateway v2 + Cognito JWT).
 *
 * Cognito group membership arrives in the `cognito:groups` JWT claim. Through the
 * API Gateway v2 JWT authorizer this claim is NOT always a clean array — depending
 * on the path it can be:
 *   - a real array:          ["admin", "beta"]
 *   - a JSON-encoded array:  "[\"admin\",\"beta\"]"
 *   - a bracketed string:    "[admin beta]"   (space- or comma-separated)
 *   - a plain delimited str: "admin,beta"  /  "admin beta"
 *
 * extractGroups() normalises all of these to a string[].
 *
 * The admin group name can be overridden with the ADMIN_GROUP_NAME env var.
 */

const ADMIN_GROUP = (process.env.ADMIN_GROUP_NAME || "admin").trim();

function extractGroups(claims) {
  if (!claims) return [];
  const raw = claims["cognito:groups"];
  if (raw == null) return [];

  if (Array.isArray(raw)) {
    return raw.map(String).map((s) => s.trim()).filter(Boolean);
  }

  let s = String(raw).trim();

  // JSON array form: "[\"admin\",\"beta\"]"
  if (s.startsWith("[") && s.includes('"')) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) {
        return parsed.map(String).map((x) => x.trim()).filter(Boolean);
      }
    } catch {
      /* fall through to delimiter parsing */
    }
  }

  // Bracketed string form: "[admin beta]" -> "admin beta"
  s = s.replace(/^\[/, "").replace(/\]$/, "");
  return s.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
}

function getClaims(event) {
  return event?.requestContext?.authorizer?.jwt?.claims ?? null;
}

function isAdmin(event) {
  return extractGroups(getClaims(event)).includes(ADMIN_GROUP);
}

module.exports = { ADMIN_GROUP, extractGroups, getClaims, isAdmin };
