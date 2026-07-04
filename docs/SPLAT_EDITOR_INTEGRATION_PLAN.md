# Splat Editor Integration Plan

> Status: proposed / not yet implemented. This document is the design and delivery plan for adding an in-app Gaussian Splat editing page to Splatial, built on the open-source SuperSplat editor. Read `CLAUDE.md` first — this plan follows its architecture and coding conventions throughout.

---

## 1. Goal

From a scene the user owns, add an **Edit** action that opens a full editor page. The page automatically loads the scene's current `.splat` file from S3, lets the user edit it in an embedded SuperSplat editor, and offers **Save** (uploads the edited splat and makes it the scene's new active file) or **Cancel** (discards changes, nothing on the server changes).

## 2. Licensing findings

`playcanvas/supersplat` (the editor) and `playcanvas/supersplat-viewer` are both MIT licensed, open source, and explicitly usable for commercial, self-hosted deployments — you are not required to use the hosted `superspl.at`/`playcanvas.com` service, and you may fork and modify the source. The only obligation is retaining the MIT license/copyright notice in the vendored code.

Two things to be careful of, not because of the license but because of trademark/brand hygiene: don't use the "SuperSplat" name or logo in Splatial's own user-facing UI (call it "Splat Editor" / "Studio" in our product), and don't imply affiliation with PlayCanvas. Purely a branding precaution, not a licensing blocker.

Sources: [playcanvas/supersplat](https://github.com/playcanvas/supersplat), [supersplat LICENSE](https://github.com/playcanvas/supersplat/blob/main/LICENSE), [SuperSplat 3DGS Viewer is now Open Source](https://blog.playcanvas.com/supersplat-3dgs-viewer-is-now-open-source/), [Import and Export docs](https://developer.playcanvas.com/user-manual/supersplat/editor/import-export/), [Loading and Importing Scenes wiki](https://github.com/playcanvas/supersplat/wiki/Loading-and-Importing-Scenes).

## 3. Current implementation (what already exists)

This is the part worth internalizing before writing any code — several pieces we need already exist and should be reused, not rebuilt.

**Splat format compatibility.** The custom WebGL viewer at `frontend/viewer/engine/viewerEngine.js` renders the classic 32-byte-per-splat binary `.splat` format, and the worker's training pipeline (`backend/lib/scene-view-key.js`) selects `.splat` files out of the manifest. SuperSplat's editor natively imports **and exports** `.ply`, `.compressed.ply`, `.splat`, and `.sog`. So the edited output can be exported as `.splat` and will play back in our existing viewer with zero changes to `viewerEngine.js`.

**The view-URL indirection already supports a "replace" pointer.** `backend/lib/scene-view-key.js#resolveSceneViewObject` resolves the viewable file for a scene in this order: `item.ply_key` (explicit override) → `item.output_prefix` + manifest scan → `item.s3_key` attempt-prefix scan. `ply_key` is already read by `scene-response.js` and written by `scene-update.js` (currently only used for thumbnail-key validation), but nothing currently sets it as a first-class "this is the active file" pointer. That's exactly the mechanism we need for "save replaces the old splat": write the edited file to a **new** S3 key and point `ply_key` at it, rather than overwriting the training output in place. This means:
- No DynamoDB schema change.
- No change to `GET /api/v1/scenes/{sceneId}/view-url` or the viewer — both already resolve `ply_key` first.
- The original trained output is left untouched, so "save" is non-destructive under the hood even though it looks like a replace to the user. Reverting an edit later is just clearing `ply_key`.

**IAM is already sufficient.** `infra/modules/static-site/lambda-upload.tf` already grants the upload Lambda `s3:GetObject`/`PutObject`/`DeleteObject` on `${aws_s3_bucket.splat_scenes.arn}/*` (statement `S3SplatScenesReadWrite`). A new handler that reads/writes under that same bucket needs no new IAM policy.

**CORS is already sufficient.** `infra/modules/static-site/s3-splat-scenes.tf` allows `GET, PUT, HEAD` from `https://${var.domain_name}` (plus `cors_extra_origins` for localhost). If the editor is served from the same domain (see §5), no CORS change is needed for the browser to `PUT` the edited splat straight to S3.

**Existing presign pattern to copy.** `backend/handlers/scene-thumbnail-presign.js` is almost exactly the shape of the new "presign an edit upload" endpoint: resolve the current view object, derive a key, return a presigned `PutObjectCommand` URL with `expiresIn: 3600`. The new handler is a close cousin of this one, not a new pattern.

**Existing UI wiring to extend.** `SceneCard.tsx` already has a `PrimaryAction` switch on `scene.state` and a `Pencil` icon import (currently only used for the "Draft" status badge). `DashboardGridView` → `ScenesLibraryContainer` → `useDashboardScenes` already thread `onViewScene`, `onSubmitScene`, `onCancelScene`, `onDeleteScene` down to `SceneCard`; adding `onEditScene` follows the identical pattern. Note `EditSceneModal.tsx` already exists but edits scene **metadata** (name/tags/visibility) — the new button must be labeled distinctly (e.g. "Edit Splat") to avoid user confusion with that modal.

**Hosting pipeline is a single static export.** `frontend/next.config.ts` builds with `output: "export"` in production; `.github/workflows/deploy.yml` runs `next build` then `aws s3 sync ./out s3://$SITE_BUCKET --delete` into **one** S3 bucket (`s3.tf` / `aws_s3_bucket.site`), fronted by **one** CloudFront distribution with a single default cache behavior (`cloudfront.tf`). There is no per-app bucket or CloudFront behavior — everything is one static site. `forwarded_values.query_string = false` only affects what CloudFront forwards to the S3 origin; it does not stop the browser from reading `?load=...` client-side after the HTML/JS loads, so it's not an obstacle.

## 4. Key architecture decision (resolved with you)

You chose the **forked editor** approach: fork `playcanvas/supersplat`, add a custom "Save to Splatial" action that PUTs the edited splat directly to S3 and a "Cancel" that just navigates away. This gives the exact one-click load → edit → save/cancel flow you described, at the cost of owning a small, deliberately thin fork that needs occasional rebasing onto upstream.

(The alternative — embedding the stock editor unmodified and asking the user to manually re-upload their exported file — was the fallback if the fork felt like too much upfront work. Noting it here in case priorities change mid-build.)

## 5. Target architecture

```
Dashboard (/scenes)
  SceneCard "Edit Splat" button (visible only when scene.status === READY)
        │
        ▼
/scenes/edit?sceneId=...          (new Next.js route, inside the existing
        │                          (main) route group, so AuthGate already
        │                          protects it)
        │
        │  1. GET /api/v1/scenes/{sceneId}/view-url   (existing, unchanged)
        │     → presigned GET URL for the CURRENT splat
        ▼
  <iframe src="/studio/index.html?load=<url-encoded splat GET url>">
        │                          (forked SuperSplat editor, static SPA,
        │                           served from the SAME domain/bucket —
        │                           see §5.3)
        │
        │  editor auto-loads the splat via its native `?load=` support
        │  user edits (crop, delete, colour-correct, etc.)
        │
        │  user clicks "Save to Splatial" (added toolbar button)
        │        │
        │        │ 2a. iframe → parent postMessage: {type:"request-save-target"}
        │        │ 2b. parent → POST /api/v1/scenes/{sceneId}/edit/presign
        │        │       → { putUrl, key, expiresIn }
        │        │ 2c. parent → iframe postMessage: {type:"save-target", putUrl, key}
        │        │ 2d. iframe exports current scene as .splat bytes, then
        │        │       fetch(putUrl, {method:"PUT", body: bytes})
        │        │ 2e. iframe → parent postMessage: {type:"save-complete", key}
        │        │                                    or {type:"save-error", message}
        ▼
  parent page → POST /api/v1/scenes/{sceneId}/edit/complete  { key }
        │           → HEAD-checks the object landed, then
        │             UpdateItem: ply_key = key, output_bucket = ..., updated_at = now
        ▼
  toast "Saved" → redirect to /scenes/view?sceneId=...
        (which re-fetches view-url via the existing hook and now resolves
         the new ply_key — no viewer code changes needed)

  "Cancel" (our own button, outside the iframe) → navigate back to /scenes.
  Nothing was written to S3/DynamoDB, so there is nothing to roll back.
```

### 5.1 Backend — two new handlers

Both follow the mandatory handler order from `CLAUDE.md` §5 (auth → parse → validate → sanitize → ownership) and reuse `resolveSceneViewObject`.

**`POST /api/v1/scenes/{sceneId}/edit/presign`** — `backend/handlers/scene-edit-presign.js`

- 401 if no `userId`; 404 if scene missing; 403 if `item.user_id !== userId`; 409 if `status !== "READY"`.
- Resolve the current view object (bucket + key) via `resolveSceneViewObject`.
- Derive the new key: `${dirname(viewObject.key)}/edits/edit-${Date.now()}.splat`.
- Write `pending_edit_key` / `pending_edit_bucket` onto the scene item (`UpdateItem`) so the complete step can verify the client didn't tamper with the target key — the same defensive pattern `scene-update.js` already uses for `thumbnailKey`.
- Return `{ sceneId, key, putUrl, expiresIn: 3600 }` where `putUrl` is a presigned `PutObjectCommand` (`ContentType: "application/octet-stream"`), TTL exactly `3600` per the presign-URL rule in `CLAUDE.md` §5.

**`POST /api/v1/scenes/{sceneId}/edit/complete`** — `backend/handlers/scene-edit-complete.js`

- Same auth/ownership checks.
- Body: `{ key }`. Reject (400) if `key !== item.pending_edit_key` — prevents a client from pointing `ply_key` at an arbitrary object.
- `HeadObjectCommand` on the target to confirm the upload actually landed (non-zero size); 409 if missing.
- `UpdateItem`: `SET ply_key = :key, output_bucket = :bucket, updated_at = :now REMOVE pending_edit_key, pending_edit_bucket`, `ConditionExpression: "user_id = :uid AND #s = :ready"` (same optimistic-concurrency style as `scene-update.js`).
- Return the updated scene via `sceneResponseFromItem` (already emits `plyKey` when present), matching the response shape other mutation endpoints use.

Both handlers get registered in `backend/upload.js`'s `routeKey` switch, right after the existing `.../thumbnail/presign` case. No new environment variables, no new IAM statements (existing `S3SplatScenesReadWrite` + `DynamoDBScenesAccess` policies already cover `GetObject`, `PutObject` is not even needed here since the Lambda never touches the bytes — only presigns — and `HeadObjectCommand`/`GetItemCommand`/`UpdateItemCommand` are already permitted).

### 5.2 Editor fork — minimal, isolated patch

Fork `playcanvas/supersplat` into a new top-level directory `splat-editor/` in this repo (git submodule or subtree pointing at the fork, your call — a submodule keeps the upstream diff cleanest for future rebases). All Splatial-specific changes live in one new module so the diff against upstream stays small and mergeable:

- `src/splatial/save-integration.ts` (new file): reads `sceneId` from the URL query string; listens for `window.postMessage` events of type `save-target` from the parent frame; on receipt, calls SuperSplat's existing internal scene-serialization function (the same one `File > Export` already uses, just invoked programmatically instead of triggering a download) to get the current scene as `.splat` bytes, then `fetch(putUrl, { method: "PUT", body: bytes })`, then posts `save-complete` or `save-error` back to `window.parent` with an explicit target origin (never `"*"`).
- One new toolbar/menu entry: "Save to Splatial" → posts `{type:"request-save-target"}` to `window.parent` and shows a spinner until `save-complete`/`save-error` comes back. The native `File > Export` menu stays untouched for anyone who wants a local download too.
- No changes needed for **load** — the existing `?load=<url>` query param already does this.
- No changes needed for **cancel** — handled entirely by our own host page's UI, outside the iframe.

De-risk this first (see Phase 0 below): before investing in the postMessage plumbing, verify hands-on that (a) the internal export-to-buffer function can be called without going through the file-save dialog, and (b) a `.splat` round-trip through the fork's export still renders correctly in `viewerEngine.js`. Both are very likely fine given the documented format support, but neither has been verified against the actual SuperSplat source in this pass — flagging as the one real unknown in this plan.

### 5.3 Hosting — no new S3 bucket or CloudFront resources

Because the whole site is already one static export synced to one bucket behind one CloudFront distribution, the editor build ships as ordinary static assets:

- Build the fork (`npm run build` in `splat-editor/`, or whatever its own tooling produces) into its `dist/`.
- Copy that `dist/` into `frontend/public/studio/` before `next build` runs (a small `prebuild` script or a CI step). Next.js copies everything under `public/` verbatim into `out/` during static export.
- The existing `aws s3 sync ./out s3://$SITE_BUCKET --delete` step in `deploy.yml` then picks it up automatically at `s3://$SITE_BUCKET/studio/...` — **zero changes to `deploy.yml` or any `.tf` file are required for hosting.**
- The editor is reached at `https://splatial-<env>.openspacenexus.store/studio/index.html`, same origin as the app, same origin the splat-scenes bucket's CORS policy already allows.

Optional hardening (not blocking, worth doing before prod rollout): add an `aws_cloudfront_response_headers_policy` with `Content-Security-Policy: frame-ancestors 'self'` attached to the default cache behavior in `cloudfront.tf`, so no third-party site can iframe `/studio/*` (defense against clickjacking). This is a small, isolated Terraform addition and can land in its own PR.

### 5.4 Frontend changes

- New route: `frontend/app/(main)/scenes/edit/page.tsx` (Suspense + client component), same shape as `frontend/app/(main)/scenes/view/page.tsx`. Being inside `(main)` means `AuthGate` already protects it — no new auth wiring.
- New component `components/features/scenes/EditScenePageClient.tsx`: fetches the view URL (`getSceneViewUrl`, reused as-is), renders the iframe, owns the `postMessage` listener (validating `event.origin` against the known `/studio` origin), and renders a small header bar with the scene name, a "Cancel" button (`router.back()` / push to `/scenes`), and a save-status toast ("Saving…" / "Saved" / "Save failed — try again").
- New hook `hooks/scenes/useSceneEditSession.ts` encapsulating the state machine: `idle → awaiting-save-target → uploading → completing → done | error`.
- New service functions in `services/scenesService.ts` (or a new `services/sceneEditService.ts`): `presignSceneEdit(sceneId)` → `POST .../edit/presign`, `completeSceneEdit(sceneId, key)` → `POST .../edit/complete`. Same `authenticatedFetch` pattern as every other service function.
- New types in `types/api.ts`: `EditPresignResponse`, `EditCompleteRequest`, reuse `Scene`/`UpdateSceneResponse` for the complete response shape (it already carries `plyKey`).
- `SceneCard.tsx`: add an "Edit Splat" outline button next to "View Scene", shown only when `scene.state === "complete"`; wire `onEditScene` through `DashboardGridView` → `ScenesLibraryContainer` → `useDashboardScenes`, mirroring the existing `onViewScene` prop-drilling exactly.

### 5.5 State machine

No new DynamoDB `status` value is introduced. Editing is not a tracked job — there's no GPU work, no SQS message, no worker involvement; it's a client-side edit followed by a direct-to-S3 PUT, which fits the "zero-buffer upload path" principle in `CLAUDE.md` §1 (Lambda still never touches binary data, it only presigns). The only guard is the existing `status === "READY"` check, enforced identically in both new handlers and re-checked at complete time via `ConditionExpression` to catch a scene that changed state mid-edit (e.g., got deleted) — returns `409`, same convention as `scene-update.js`.

### 5.6 Rollback / safety

Because `splat_scenes` already has versioning enabled with 30-day noncurrent-version expiration, and because the save flow writes a **new** key rather than overwriting the original training output, there are two independent safety nets: the original trained file is never touched, and even the edited file's own version history is recoverable for 30 days if a second edit overwrites the same key. Reverting a bad edit is just clearing `ply_key` (falls back to the original manifest-resolved file) or repointing it at a prior edit key. A future "edit history" list (append `{key, timestamp}` to the scene item on every save) would make multi-step revert self-service, but is explicitly out of scope for the first version — call it out as backlog.

## 6. Security checklist

- Ownership check (`item.user_id === userId`) before issuing a presign and before completing, matching every existing scene handler.
- Presigned PUT `expiresIn: 3600`, never longer, per `CLAUDE.md` §5.
- `edit/complete` validates the submitted `key` against a server-recorded `pending_edit_key`, not a client-supplied path — prevents pointing `ply_key` at an object outside this scene's prefix.
- `HeadObjectCommand` before trusting the upload happened, so a failed/aborted PUT can't silently "complete."
- `postMessage` on both sides checks `event.origin` explicitly; the editor never posts to `"*"`.
- (Optional, recommended before prod) `frame-ancestors 'self'` CSP on the static site so only Splatial itself can iframe `/studio/*`.
- No new wildcard IAM actions/resources — everything rides on the existing `S3SplatScenesReadWrite` statement.

## 7. Delivery phases

1. **Spike (de-risk the one real unknown).** Fork `supersplat`, run it locally, confirm the internal export-to-buffer call is reachable without the file-save dialog, and confirm a `.splat` export round-trips correctly through `viewerEngine.js`. Stop and reassess if either doesn't hold.
2. **Backend.** `scene-edit-presign.js`, `scene-edit-complete.js`, route registration, `node -e "require('./upload')"` sanity check. No infra changes needed here.
3. **Editor fork.** `save-integration.ts`, the "Save to Splatial" toolbar entry, the two-way `postMessage` protocol, manual QA of load → edit → save against a dev-bucket scene.
4. **Hosting wire-up.** `frontend/public/studio/` copy step, confirm it survives `next build` + the existing S3 sync unchanged.
5. **Frontend.** New route, page client, hook, services, types, `SceneCard` "Edit Splat" button.
6. **Optional hardening.** `frame-ancestors` CSP via a new `aws_cloudfront_response_headers_policy` (own PR, `terraform plan`/`apply` reviewed per the standard checklist in `CLAUDE.md` §9).
7. **End-to-end QA.** Full round trip (load → edit → save → view shows new splat); cancel mid-edit leaves the scene untouched; presign-expiry edge case (long edit session); ownership check (attempt to edit someone else's private scene → 403); revert drill (manually clear `ply_key`, confirm original splat reappears).
8. **Rollout.** dev → staging → prod, following the existing environment promotion process; no changes to `deploy.yml` are anticipated (see §5.3), so this is a normal merge-to-branch deploy like any other feature.

## 7b. Implementation status (initial build landed)

A first working version of this feature has been implemented on the `dev` branch:

- **Editor fork**: `playcanvas/supersplat` v2.28.1 built and vendored into `frontend/public/studio/` (static assets, `base href="/studio/"`). The only source change is `src/iframe-api.ts` — it extends SuperSplat's existing iframe postMessage API to accept `{ type: "save-target", putUrl, key }`, serialize the visible splats to `.splat` via the editor's own `serializeSplat` + an in-memory `MemoryFileSystem`, `PUT` the bytes straight to the presigned S3 URL, and post back `save-complete` / `save-error`. No editor UI was modified — the host page owns the Save button. This confirms the §8 spike unknown: the export-to-buffer path **is** cleanly callable in isolation.
- **Backend**: `backend/handlers/scene-edit-presign.js` and `scene-edit-complete.js`, wired into `backend/upload.js`. No IAM/CORS/schema changes needed, exactly as predicted in §3.
- **Frontend**: `/scenes/edit` route + `EditScenePageClient` (iframe host with Cancel + "Save to Splatial"), `presignSceneEdit`/`completeSceneEdit` services, `EditPresignResponse`/`EditCompleteRequest` types, and an "Edit Splat" button on `SceneCard` threaded through the existing prop chain.

Verification done: `node -e "require('./upload')"` passes; `tsc --noEmit` and `eslint` pass on all changed frontend files; the vendored editor serves all assets (index.html/js/css/locales) with HTTP 200 under `/studio/`.

**Build-type caveat for CI**: the editor was built with `BUILD_TYPE=debug BASE_HREF=/studio/` (the release build with full minification is very slow). For production, CI should run the **release** build (`BASE_HREF=/studio/ npm run build`, no `BUILD_TYPE=debug`) to get minified assets — the debug bundle is ~9 MB unminified. Source maps were excluded from the vendored copy to keep it lean. Regenerating: build the fork, then copy `dist/` (minus `*.map`) into `frontend/public/studio/`.

Still outstanding before prod: end-to-end save test against a live dev scene (presign → editor PUT → complete → view shows edited splat); confirming the editor's service worker (`sw.js`, scoped to `/studio/`) doesn't interfere with the main app's caching; and the optional `frame-ancestors` CSP hardening from §5.3.

## 8. Open items to verify during the spike (not yet confirmed against source)

- Whether SuperSplat's internal scene-export function is cleanly callable in isolation, or whether it's tightly coupled to its own file-save-dialog UI flow (would change the shape of `save-integration.ts` but not the overall architecture).
- Confirm `.splat` (not just `.ply`/`.compressed.ply`) is genuinely present in the fork's **export** menu, not only import — the docs list it as a supported format but the export dropdown wasn't inspected directly.
- Browser memory ceiling for very large scenes edited entirely client-side — not a new limitation Splatial introduces, but worth a friendly error message if the editor reports an out-of-memory condition.
