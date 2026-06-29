# Splatial — Social & Interaction Layer Reference

> **Last updated:** 2026-06-29 | **Branch:** `dev` | **Region:** `us-east-1`
>
> This document is the as-built reference for the **social and interaction layer**
> built on top of the core Splatial 3D Gaussian Splatting pipeline. It covers
> Features 1–15: profiles, follows, feed, explore, tags, reactions, comments,
> mentions, notifications, bookmarks, viewpoints, guided tours, and remix/fork.
>
> It is a companion to [`ARCHITECTURE_REFERENCE.md`](./ARCHITECTURE_REFERENCE.md)
> (the core upload→train→view pipeline) and [`logging-spec.md`](./logging-spec.md).
> Read those for the base platform; read this for everything users do *around* a
> scene.

---

## Table of Contents

1. [Scope & Feature Map](#1-scope--feature-map)
2. [Design Principles](#2-design-principles)
3. [Cross-Cutting Conventions](#3-cross-cutting-conventions)
4. [Data Model Catalog](#4-data-model-catalog)
5. [API Reference](#5-api-reference)
6. [Feature Deep-Dives (1–15)](#6-feature-deep-dives-115)
7. [Frontend Architecture](#7-frontend-architecture)
8. [Known Limitations & Upgrade Paths](#8-known-limitations--upgrade-paths)
9. [Operational Notes](#9-operational-notes)
10. [Best Practices for Extending the Social Layer](#10-best-practices-for-extending-the-social-layer)

---

## 1. Scope & Feature Map

The social layer turns a private rendering tool into a shared platform. Each
feature was shipped as an independent, deployable increment.

| # | Feature | Adds |
|---|---|---|
| 1 | User Profiles & Usernames | Identity: unique handle, display name, bio, avatar, counters |
| 2 | Scene Visibility | `PUBLIC`/`PRIVATE` + denormalized owner identity on scenes |
| 3 | Public Profiles `/u/<username>` | Public profile page + per-user public-scene listing |
| 4 | Follow / Unfollow | Social graph + follower/following counts |
| 5 | Personalized Feed | Scenes from people you follow (fan-out on read) |
| 6 | Explore | Newest public scenes (global), with category/tag filters |
| 7 | Tags & Categories | Controlled categories + free-form tags on scenes |
| 8 | Reactions | Multi-type reactions (👍❤️😮🔥😂) with per-type counts |
| 9 | Comments | Threaded-flat comments with author/owner moderation |
| 10 | @mentions | Resolved mentions in comment bodies |
| 11 | Notifications | Follow / reaction / comment / mention center + unread badge |
| 12 | Bookmarks | Per-user "Saved" list |
| 13 | Viewpoints / "Shots" | Save & share a camera angle |
| 14 | Guided Tours | Ordered viewpoints with auto fly-through |
| 15 | Remix / Fork | Copy a public scene into your account, with lineage |

> **Status:** all 15 are merged to `dev` and deployed to
> `splatial-dev.openspacenexus.store`.

---

## 2. Design Principles

The social layer follows the same principles as the core platform, plus a few of
its own.

- **Serverless extension, no new compute tier.** Every feature is added as routes
  on the existing single HTTP API → single Lambda router (`backend/upload.js`) →
  one handler per route. No new services, queues, or servers were introduced.
- **Table-per-domain.** Each feature owns its DynamoDB table(s)
  (`*-follows`, `*-reactions`, …) rather than overloading a single-table design.
  This matches the repo's existing "file-per-concern" / "table-per-concern"
  convention and keeps each feature independently reasoned about.
- **Incremental, layer-split delivery.** Each feature shipped as two deployable
  units: **Infra+Backend** first (data model + API), then **Frontend**. This keeps
  blast radius small, lets the API stabilize before the UI builds on it, and maps
  cleanly onto the cost-optimized CI (see §9).
- **Denormalize for read paths.** Author/owner identity is copied onto child
  records (scenes, comments, notifications) at write time so list endpoints never
  do N+1 profile lookups.
- **Correctness over cleverness for counters.** All cross-record counters use
  DynamoDB transactions with idempotency and non-negative guards.
- **Best-effort for secondary effects.** Notification emission never fails the
  primary action.

---

## 3. Cross-Cutting Conventions

These patterns repeat across every feature; understand them once.

### 3.1 Identity & Authentication

- Auth is **Cognito JWT** via the API Gateway JWT authorizer. Every handler reads
  the caller from `event.requestContext.authorizer.jwt.claims.sub` and returns
  `401` if absent. `sub` is the canonical, immutable user id throughout the social
  layer.
- **Usernames are required.** A user has no username until onboarding. A username
  is `3–20` chars, `^[a-z0-9_]+$`, lowercased, and not in a reserved list. The
  `*-usernames` table guarantees global uniqueness via a conditional `PutItem`;
  the `*-profiles` table holds the profile keyed by `user_id`.
- The frontend forces a username at signup via a **mandatory onboarding gate**
  (`ProfileOnboardingGate`) that blocks the authenticated app until a handle is
  claimed.

### 3.2 Request Routing

- One HTTP API (`aws_apigatewayv2_api`) with one integration → one Lambda
  (`aws_lambda_function.upload_lambda`). `backend/upload.js` switches on
  `event.routeKey` and delegates to `backend/handlers/<name>.js`.
- Adding an endpoint = (a) a handler file, (b) a `case` in `upload.js`, (c) a
  matching `aws_apigatewayv2_route` in `infra/modules/static-site/network.tf`. The
  route string in `upload.js` must match the Terraform `route_key` exactly.
- The Lambda is **packaged by Terraform** (`archive_file` over `backend/`), so any
  backend change is deployed by `terraform apply`.

### 3.3 Data-Modeling Patterns

- **Time-sortable sort keys.** Child collections (comments, shots, tours,
  notifications) use a sort key of the form `"<ISO created_at>#<uuid>"`, so a
  `Query` on the partition with `ScanIndexForward:false` returns newest-first and
  is naturally unique.
- **Denormalized identity.** Scenes carry `owner_username`/`owner_display_name`/
  `owner_avatar_*`; comments carry `author_*`; notifications carry `actor_*`.
  Refreshed at the relevant write so reads avoid joins.
- **Sparse GSIs for filtered listings.** The scenes table uses
  `public_owner_id` (set **only** when a scene is `PUBLIC`) to power per-user
  public listings without scanning. This attribute is maintained on the visibility
  transition.
- **Opaque cursors.** List endpoints paginate with a base64-encoded DynamoDB
  `LastEvaluatedKey` (`{ nextCursor }`). The feed uses a time-string cursor instead
  (see §6.5) because it merges multiple queries.

### 3.4 Atomic Counters & Transactions

Counters that must agree with a relationship row (followers, reactions, comments)
are mutated with **`TransactWriteItems`**, so the edge row and the counter(s) move
together:

- **Follow:** `Put` follows edge (condition `attribute_not_exists`) +
  `Update` followee `followers_count` +1 + `Update` follower `following_count` +1.
- **Reaction:** `Put`/overwrite reaction row + a single `Update` on the scene that
  adjusts the per-type counters. (Changing reaction type decrements old and
  increments new **in one `Update`** — a transaction cannot touch the same item
  twice.)
- **Comment:** `Put` comment + `Update` scene `comments_count` +1.

Rules enforced everywhere:
- **Idempotency:** conditional writes; a `TransactionCanceledException` caused by
  the idempotency condition is treated as success (no double counting).
- **Non-negative:** decrements are guarded (`if_not_exists(c,:0) >= :1`) so counts
  never go below zero.

### 3.5 Visibility & Authorization

- **Read of scene data** (`scene-status`, `view-url`, shots, tours, reactions,
  comments, fork source) is allowed when the caller **owns** the scene **OR** the
  scene is `PUBLIC`. This single rule — "owner OR PUBLIC" — is implemented via
  `sceneVisibilityFromItem`. A missing `visibility` attribute means `PRIVATE`.
- **Mutation of a child resource** is gated by the actor:
  - Delete a comment → comment **author** or **scene owner**.
  - Delete a shot/tour → **creator** or **scene owner**.
- **Self-actions never notify** the actor.

### 3.6 Pagination

- Default page sizes: 20–24, clamped to ~50.
- `{ items, nextCursor? }` envelope; absence of `nextCursor` means the last page.

### 3.7 Static Hosting & Dynamic Routes

The frontend is a **Next.js static export** (`output: 'export'`) on S3+CloudFront.
Dynamic client routes (e.g. `/u/[username]`) emit a single placeholder shell at
build time. A **CloudFront Function** rewrites `/u/*` to that shell so direct loads
/ refreshes work; the client reads the real handle from the URL. **Any future
client-rendered dynamic route must add its prefix to that function** or it will
404 on hard load. (See `infra/modules/static-site/cloudfront.tf`.)

---

## 4. Data Model Catalog

All tables are `PAY_PER_REQUEST`, SSE-enabled, with point-in-time recovery, and
named `${project}-${env}-<name>`.

| Table | PK | SK | GSIs | Purpose |
|---|---|---|---|---|
| `scenes` | `scene_id` | — | `user_id-status` (KEYS_ONLY); `visibility-created_at` (ALL); `public_owner-created_at` (ALL) | Scene records + denormalized owner + counters |
| `profiles` | `user_id` | — | `username-index` (KEYS_ONLY) | Profile, counters, unread count |
| `usernames` | `username` | — | — | Atomic username uniqueness → `user_id` |
| `follows` | `follower_id` | `followee_id` | `followee-follower` (KEYS_ONLY) | Social graph (both directions) |
| `reactions` | `scene_id` | `user_id` | — | One reaction per user per scene |
| `comments` | `scene_id` | `comment_id` (time) | — | Comments + denormalized author + mentions |
| `notifications` | `user_id` | `notification_id` (time) | — | Per-recipient notification log |
| `bookmarks` | `user_id` | `scene_id` | `user_id-added_at` (KEYS_ONLY) | Saved scenes |
| `shots` | `scene_id` | `shot_id` (time) | — | Saved camera view matrices |
| `tours` | `scene_id` | `tour_id` (time) | — | Ordered viewpoint sequences |

### Key scene attributes added by the social layer

| Attribute | Type | Set when | Used by |
|---|---|---|---|
| `visibility` | S (`PUBLIC`/`PRIVATE`) | create / PATCH | F2,3,5,6 |
| `owner_username`, `owner_display_name`, `owner_avatar_key/bucket` | S | create / visibility toggle | F3,5,6 |
| `public_owner_id` | S | only while `PUBLIC` | F3 (per-user public list) |
| `category` | S | create / PATCH | F7 |
| `tags` | SS | create / PATCH | F7 |
| `rc_like…rc_haha`, `reactions_total` | N | reaction txn | F8, future trending |
| `comments_count` | N | comment txn | F9 |
| `forked_from_scene_id`, `forked_from_username`, `forks_count` | S/S/N | fork | F15 |

### Key profile attributes

`username`, `display_name`, `bio`, `avatar_key/bucket`, `followers_count`,
`following_count`, `scenes_count` (public), `unread_count`,
`notifications_last_read_at`.

---

## 5. API Reference

All routes are JWT-authorized. Base path is the API Gateway custom domain
(`api-<env>.openspacenexus.store`); the frontend reaches them via
`getApiBaseUrl()`.

### Profiles & Social Graph
```
GET    /api/v1/profile/me
PUT    /api/v1/profile/me
GET    /api/v1/profile/username-available/{username}
GET    /api/v1/profiles/{username}
GET    /api/v1/profiles/{username}/scenes
POST   /api/v1/profiles/{username}/follow
DELETE /api/v1/profiles/{username}/follow
```

### Discovery
```
GET    /api/v1/feed
GET    /api/v1/explore            # ?category= &tag= &cursor= &limit=
```

### Scene Interactions
```
PUT    /api/v1/scenes/{sceneId}/reaction      # body { type }
DELETE /api/v1/scenes/{sceneId}/reaction
POST   /api/v1/scenes/{sceneId}/comments      # body { body }
GET    /api/v1/scenes/{sceneId}/comments
DELETE /api/v1/scenes/{sceneId}/comments/{commentId}
PUT    /api/v1/scenes/{sceneId}/bookmark
DELETE /api/v1/scenes/{sceneId}/bookmark
GET    /api/v1/bookmarks
POST   /api/v1/scenes/{sceneId}/fork          # body { name? }
```

### Camera (Viewpoints & Tours)
```
POST   /api/v1/scenes/{sceneId}/shots         # body { viewMatrix[16], label? }
GET    /api/v1/scenes/{sceneId}/shots
GET    /api/v1/scenes/{sceneId}/shots/{shotId}
DELETE /api/v1/scenes/{sceneId}/shots/{shotId}
POST   /api/v1/scenes/{sceneId}/tours         # body { title, items[], segmentDurationMs? }
GET    /api/v1/scenes/{sceneId}/tours
GET    /api/v1/scenes/{sceneId}/tours/{tourId}
DELETE /api/v1/scenes/{sceneId}/tours/{tourId}
```

### Notifications
```
GET    /api/v1/notifications
POST   /api/v1/notifications/read
GET    /api/v1/notifications/unread-count
```

Scene visibility itself reuses the existing `PATCH /api/v1/scenes/{sceneId}`
(accepts `visibility`, `category`, `tags` in addition to `name`/`thumbnailKey`).

---

## 6. Feature Deep-Dives (1–15)

Each section: **Summary · Data · Endpoints/Logic · Frontend · Invariants & edge
cases**.

### 6.1 User Profiles & Usernames

- **Summary:** identity foundation everything else depends on.
- **Data:** `profiles` (`user_id` PK, `username-index` GSI), `usernames`
  (`username` PK). Counters initialized to 0.
- **Logic:** `GET /profile/me` lazily provisions a minimal profile. `PUT /profile/me`
  validates and **atomically claims/renames** the username (conditional put on
  `usernames`, delete old row on rename). Username validation is centralized in
  `backend/lib/profile.js` (`validateUsername`, reserved list).
- **Frontend:** `/onboarding` (mandatory gate), `/settings/profile`.
- **Invariants:** uniqueness is enforced by the `usernames` table, **not** Cognito
  (`preferred_username` is only collected for UX). Cognito `sub` is the identity.

### 6.2 Scene Visibility & Owner Denormalization

- **Summary:** makes a scene shareable and stamps the author onto it.
- **Data:** `visibility` + `owner_*` + sparse `public_owner_id` on the scene;
  `visibility-created_at` and `public_owner-created_at` GSIs.
- **Logic:** default `PRIVATE`. On the visibility transition (`scene-update.js`):
  refresh `owner_*` from the current profile, maintain `scenes_count` on the
  profile, and **set/remove `public_owner_id`** to keep the sparse index correct.
- **Invariants:** missing `visibility` ≡ `PRIVATE`. `public_owner_id` exists **iff**
  the scene is public.

### 6.3 Public Profiles `/u/<username>`

- **Summary:** a public page (header + that user's public scenes).
- **Logic:** `GET /profiles/{username}` returns the public profile (now also
  `isFollowing`/`isSelf`, added in F4). `GET /profiles/{username}/scenes` queries
  the sparse `public_owner-created_at` index (newest-first, cursor-paged).
  `scene-view-url` and `scene-status` were opened to **owner-OR-public** so
  non-owners can actually render a public scene.
- **Frontend:** `/u/[username]` (lives under `(main)`, authenticated). Static-export
  routing handled by the CloudFront rewrite (see §3.7).

### 6.4 Follow / Unfollow

- **Data:** `follows` (`follower_id`+`followee_id`), reverse GSI for "followers of".
- **Logic:** `follow`/`unfollow` are transactional and idempotent (see §3.4),
  returning `{ following, followersCount }`. `followUser` reports `created` so F11
  only notifies on a genuinely new edge.
- **Frontend:** Follow/Following toggle on `/u/[username]` (hidden on own profile,
  optimistic with rollback).

### 6.5 Personalized Feed

- **Summary:** public scenes from people you follow, newest-first.
- **Logic (fan-out on read):** `listFollowing(userId)` → fan a concurrent `Query`
  per followee against `public_owner-created_at` → merge, sort desc, de-dupe by
  `scene_id`, page via a **time-string cursor** (`created_at`). Items carry the
  denormalized author via `feedItemFromScene`.
- **Frontend:** `/feed` (read-only scene cards + author row → `/u/<handle>`).
- **Limitation:** scales with follow count (capped at 500 followees). Upgrade path:
  fan-out on write (materialized feed table). See §8.

### 6.6 Explore

- **Summary:** global newest public scenes; optional category/tag filter.
- **Logic:** `GET /explore` queries `visibility-created_at` (`visibility=PUBLIC`,
  newest-first, native `LastEvaluatedKey` cursor). `?category`/`?tag` add a
  `FilterExpression` (post-read filter; see F7).
- **Frontend:** `/explore`, shares the read-only grid component with `/feed`.
- **Note:** **trending is deliberately deferred** — `reactions_total` (F8) is now
  the engagement signal that a future trending sort can rank on.

### 6.7 Tags & Categories

- **Data:** `category` (S, fixed vocabulary) + `tags` (SS) on scenes. Vocabulary in
  `backend/lib/scene-taxonomy.js` (mirrored by a frontend constant).
- **Logic:** set on create/PATCH; tags normalized (lowercase, slugified, ≤10,
  ≤30 chars each); empty sets are never written. Surfaced via the shared scene
  mapper, so they appear on every list automatically. Explore filtering uses
  `FilterExpression`.
- **Limitation:** filter is post-read (fine at MVP scale). Upgrade: sparse
  `public_category` GSI, same pattern as `public_owner_id`.

### 6.8 Reactions

- **Data:** `reactions` (`scene_id`+`user_id`); per-type counters `rc_*` +
  `reactions_total` on the scene. Types in `backend/lib/reaction-types.js`.
- **Logic:** one reaction per user per scene; setting a different type **changes**
  (total unchanged); setting the same type is a no-op; deleting removes. All via
  one transaction (§3.4). `scene-status` returns the caller's `myReaction`; list
  mappers return counts only.
- **Frontend:** interactive `ReactionBar` on the viewer (toggle, optimistic);
  total indicator on cards.

### 6.9 Comments

- **Data:** `comments` (`scene_id` + time-sortable `comment_id`), denormalized
  `author_*`; `comments_count` on the scene.
- **Logic:** create/list/delete; delete allowed for **author or scene owner**;
  body ≤1000 chars stored as **raw text** (rendered as text, never HTML).
- **Frontend:** `CommentSection` on the viewer (composer, optimistic, load-more);
  `whitespace-pre-wrap` rendering.

### 6.10 @mentions

- **Data:** `mention_usernames` (SS, for links) + `mention_user_ids` (SS, for
  notifications) on the comment — only **resolved, real** handles.
- **Logic:** `backend/lib/mentions.js` parses `@handle` tokens and resolves them
  via `resolveUserIdByUsername`; unresolved handles are dropped. Surfaced as
  `mentions: string[]`.
- **Frontend:** body renderer links only handles present in `mentions`, using React
  text nodes + `<Link>` (never `dangerouslySetInnerHTML`).

### 6.11 Notifications

- **Data:** `notifications` (`user_id` recipient + time `notification_id`);
  `unread_count` + `notifications_last_read_at` on the profile.
- **Logic:** `emitNotification` (TransactWrite: put notification + bump
  `unread_count`) is **best-effort** (errors swallowed) and **skips
  self-notifications**. Hooked into follow (on new edge), reaction (on newly added,
  not own scene), comment (to owner) and mention (to each mentioned user, deduped
  vs. the owner's comment notification). List computes per-item `read` by comparing
  `created_at` to `notifications_last_read_at`; `POST /notifications/read` resets.
- **Frontend:** nav bell with polled unread badge; `/notifications` page;
  mark-all-read on open.

### 6.12 Bookmarks

- **Data:** `bookmarks` (`user_id`+`scene_id`) + `user_id-added_at` GSI.
- **Logic:** idempotent save/unsave; `GET /bookmarks` lists newest-first via the
  GSI, `BatchGetItem`s the scenes, and **filters to still-visible** scenes (drops
  deleted / now-private-and-not-owned). `isBookmarked` on `scene-status`.
- **Frontend:** Save toggle on the viewer; `/saved` page (reuses the feed grid).
- **Note:** collections (named boards) are deferred.

### 6.13 Viewpoints / "Shots"

- **Data:** `shots` (`scene_id` + time `shot_id`) storing a **16-float
  column-major view matrix** (List of Number) + label + creator.
- **Logic:** CRUD gated by visibility; delete = creator or scene owner. Strict
  16-finite-number validation (`backend/lib/shots.js`).
- **Frontend:** capture via `getViewMatrixSnapshot()`; jump via the controls'
  `setViewMatrix` (exposed to React as `applyViewMatrix` in `viewerState.js`, which
  keeps user control). Shareable via `/scenes/view?id=…&shot=<id>`.

### 6.14 Guided Tours

- **Data:** `tours` (`scene_id` + time `tour_id`) **embedding** 2–20 view matrices
  + `segmentDurationMs`. Self-contained (survives deletion of source shots).
- **Logic:** CRUD gated by visibility; delete = creator or scene owner.
- **Frontend:** `useCameraTrajectory` generalized with `playKeyframes()` (reuses the
  existing `interpolateViewMatrix` RAF loop). Builder assembles stops from saved
  Shots / captured views; player shows progress + stop; shareable via
  `?tour=<id>` (auto-plays).

### 6.15 Remix / Fork

- **Summary:** copy a public (or own) READY scene into your account, with lineage.
- **Logic:** `resolveSceneViewObject` locates the source's single viewable artifact;
  `CopyObjectCommand` **server-side-copies** the splat + thumbnail into
  `forks/<userId>/<newSceneId>/`; a new `PRIVATE`/`READY` scene is written with
  `ply_key` pointing at the copy and `forked_from_*` lineage; the source
  `forks_count` is bumped best-effort. No GPU re-run, no byte buffering.
- **Frontend:** Remix button on the viewer; "Remixed from @owner" attribution;
  forks count on cards.
- **Limitation:** single-part `CopyObject` (≤5 GB); copies the **output only**, not
  the raw images/training project (so it's remixable, not re-trainable).

---

## 7. Frontend Architecture

- **Framework:** Next.js 16 App Router (static export), React 19, TS strict,
  Tailwind v4, shadcn/ui, AWS Amplify (Cognito).
- **Auth/API:** all calls go through `services/apiClient.ts` → `authenticatedFetch`
  (injects the Cognito JWT). Base URL from `api/baseUrl.ts`. One service module per
  domain: `profileService`, `feedService`, `exploreService`, `reactionsService`,
  `commentsService`, `notificationsService`, `bookmarksService`, `shotsService`,
  `toursService`, plus the pre-existing `scenesService`.
- **Pages (`app/(main)/`):** `onboarding`, `settings/profile`, `u/[username]`,
  `feed`, `explore`, `notifications`, `saved`, plus the existing `scenes/*`.
- **Gating:** `(main)/layout.tsx` = `AuthGate` → `ProfileOnboardingGate`. The
  onboarding gate enforces a username before any authenticated page renders.
- **Types:** all response shapes in `types/api.ts` (strict; no `any`).
- **Viewer integration:** the WebGL viewer represents the camera as a 16-float view
  matrix. `getViewMatrixSnapshot()` reads it; controls' `setViewMatrix` (wrapped as
  `applyViewMatrix`) seeds it; `useCameraTrajectory` + `interpolateViewMatrix` do
  playback for tours.

---

## 8. Known Limitations & Upgrade Paths

| Area | Current (MVP) | Upgrade path |
|---|---|---|
| Feed | Fan-out on read, ≤500 followees | Fan-out on write (materialized `feed` table) |
| Explore trending | Newest only | Rank by `reactions_total` (+ recency window) |
| Category/tag filter | `FilterExpression` (post-read) | Sparse `public_category` GSI |
| Bookmarks | Single "Saved" list | Named collections (collections + items tables) |
| Mentions | No autocomplete | Username prefix-search endpoint/index |
| Fork | Single-part CopyObject ≤5 GB; output only | Multipart copy; fork-and-retrain |
| Notification read-state | All-or-nothing via `last_read_at` | Per-item read writes |
| Per-card bookmark state | Omitted (N+1) | Sparse projection / batch check |

None of these are correctness bugs; they are deliberate scope cuts with a clear
next step.

---

## 9. Operational Notes

- **CI/CD:** push to `dev` → GitHub Actions (`.github/workflows/deploy.yml`).
  The workflow is **path-filtered**: `terraform apply` runs only when `infra/**` or
  `backend/**` changed; the frontend build/S3-sync/CloudFront-invalidation runs only
  when `frontend/**` changed. `concurrency: cancel-in-progress` + `timeout-minutes`
  cap wasted minutes. `docs/**`, `**/*.md`, `.cursor/**`, `scripts/**`, `worker/**`
  are ignored. **This document lives under `docs/`, so committing it does not
  trigger a deploy.**
- **Delivery workflow per feature:** local validation gate (backend `node --check` +
  router load; frontend `npm ci && lint && build`; terraform `fmt && validate &&
  plan` against `infra/envs/dev`) **before** a single push. This catches errors
  locally and minimizes CI runs.
- **IAM:** each new table grants the Lambda the minimum DynamoDB actions on the
  table ARN (and `index/*` where a GSI is queried). The fork feature relies on the
  existing splat-bucket `s3:GetObject`/`s3:PutObject` (CopyObject needs exactly
  those).
- **Postman:** see `docs/postman/` for a runnable collection/environment.

---

## 10. Best Practices for Extending the Social Layer

When you add the next feature, follow the established grain:

1. **Split the work Infra+Backend, then Frontend.** Deploy and verify the API
   before building UI on it.
2. **New domain → new table.** PK/SK chosen for your primary access pattern; use a
   time-sortable SK for "newest-first" collections; add a GSI only when a real query
   needs it (and prefer a **sparse** attribute for filtered listings).
3. **Reuse the helpers.** `resolveUserIdByUsername`, `sceneVisibilityFromItem`,
   `feedItemFromScene`, `getOwnerProfile`, the guarded-counter and TransactWrite
   patterns, and the base64 cursor helpers already exist — match them.
4. **Authorize with the standard rules.** Reads: owner OR PUBLIC. Child-resource
   deletes: creator OR scene owner. Never trust the client for ownership.
5. **Counters are transactional, idempotent, and non-negative.** Never write a
   bare increment that can double-count or go negative.
6. **Secondary effects are best-effort.** Notifications and similar side effects
   must never fail the primary write.
7. **Denormalize for reads, validate on writes.** Copy author/owner identity onto
   child records; centralize validation in a `lib/` module and never write empty
   DynamoDB string sets.
8. **Render user text safely.** Plain text only; build links from React nodes, never
   `dangerouslySetInnerHTML`.
9. **Mind static hosting.** A new client-rendered dynamic route (`/x/[id]`) must be
   added to the CloudFront rewrite function, or it 404s on hard load.
10. **Update this document and the API reference** in the same change. Docs-only
    commits are free (no deploy).

---

*End of Social & Interaction Layer Reference.*
