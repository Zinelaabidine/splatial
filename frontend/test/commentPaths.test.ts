/**
 * Lightweight assertion-based test for lib/api/commentPaths.ts — no test
 * framework is configured for frontend/ (see CLAUDE.md §4/§6), so this runs
 * directly under Node's native TypeScript support:
 *
 *   node --experimental-strip-types frontend/test/commentPaths.test.ts
 *
 * commentPaths.ts has no imports of its own, so it can run standalone
 * without path-alias resolution or a bundler.
 */
import assert from "node:assert/strict";
import {
  commentPath,
  commentReactionPath,
  commentRepliesPath,
  commentsListPath,
} from "../lib/api/commentPaths.ts";

const sceneId = "b5e75d62-515c-4fc6-aed7-56f8e6fb72c1";
// Real example ID from the bug report: ISO timestamp + "#" + uuid.
const commentId = "2026-07-26T10:46:10.783Z#24a6d82a-5e69-4990-a6fd-73cf92c5cea9";

// --- encodes both ":" and "#" in a single pass, one path segment ---
const path = commentPath(sceneId, commentId);
assert.equal(
  path,
  `/api/v1/scenes/${sceneId}/comments/2026-07-26T10%3A46%3A10.783Z%2324a6d82a-5e69-4990-a6fd-73cf92c5cea9`,
);
assert.ok(path.includes("%3A"), "colon must be percent-encoded");
assert.ok(path.includes("%23"), "hash must be percent-encoded");
assert.ok(
  !path.includes("#"),
  "a raw # must never appear in the path (browsers treat it as a fragment delimiter and never send anything after it)",
);

// --- does not double-encode an id that needs no escaping ---
const plainId = "plain-id-123";
assert.equal(
  commentPath(sceneId, plainId),
  `/api/v1/scenes/${sceneId}/comments/plain-id-123`,
);

// --- does not double-encode a value that already looks percent-encoded ---
// (guards against a future regression where encodeURIComponent is applied twice,
// which would turn "%23" into "%2523")
assert.ok(
  !path.includes("%25"),
  "must not double-encode — %25 would mean a % sign got re-escaped",
);

// --- reaction path reuses commentPath and appends exactly one /reaction segment ---
assert.equal(commentReactionPath(sceneId, commentId), `${path}/reaction`);

// --- replies path reuses commentPath and appends exactly one /replies segment ---
assert.equal(commentRepliesPath(sceneId, commentId), `${path}/replies`);

// --- list path ---
assert.equal(commentsListPath(sceneId), `/api/v1/scenes/${sceneId}/comments`);

console.log("commentPaths.test.ts: all assertions passed");
