# Splatial — Frontend (Next.js / TypeScript) Copilot Instructions

> Scope: `site/my-app/` — Next.js 14 App Router, TypeScript 5.x, Tailwind CSS, shadcn/ui, AWS Amplify Gen 2.

---

## Framework Conventions

- Use the **App Router** (`app/` directory) exclusively. Do not use `pages/`.
- Mark a component `"use client"` only when it uses browser APIs, event handlers, refs, or React hooks. Server Components are the default.
- Co-locate page-level data fetching in Server Components; push interactivity down to leaf Client Components.
- Route segments live under `app/`. Shared UI goes in `components/`. Business-logic hooks go in `hooks/`. Pure utilities go in `lib/` or `utils/`.

---

## TypeScript Rules

- `strict: true` is enabled in `tsconfig.json`. Never use `any`. Use `unknown` and narrow explicitly.
- Prefer `type` over `interface` for component props and function signatures unless declaration merging is required.
- All API response shapes must be declared in `types/api.ts`. Do not inline ad-hoc response types in component files.
- Use `satisfies` to validate object literals against a type without widening.
- Avoid `!` non-null assertions. Use optional chaining and explicit null checks.

---

## Authentication & API Calls

- All authenticated API calls must go through `utils/apiClient.ts` (`authenticatedFetch`). Never call `fetch` directly with raw tokens.
- Do not store JWTs, Cognito tokens, or session data in `localStorage` or `sessionStorage`. Rely on Amplify's managed session storage.
- Read the API base URL exclusively from `lib/apiBaseUrl.ts` (`getApiBaseUrl()`). Do not hardcode stage URLs or environment-specific strings in components.
- Access the current user's identity via `fetchAuthSession()` from `aws-amplify/auth`. Extract `userId` from the JWT `sub` claim only — do not depend on Cognito username.
- Wrap Amplify-dependent components in `<AmplifyProvider>` and gate authenticated routes with `<AuthGate>`.

---

## Upload & Binary Data (Browser)

### Multipart Upload Hook
- The canonical upload implementation is `hooks/useMultipartUpload.ts`. Extend it; do not create parallel upload logic elsewhere.
- Part size is `DEFAULT_PART_SIZE = 5 * 1024 * 1024` (S3 minimum). Do not lower this value.
- Concurrency is `DEFAULT_CONCURRENCY = 6` parallel PUTs per file. Do not exceed 10 without profiling network saturation.
- Pass `AbortSignal` from a `useRef<AbortController>` into each `fetch` call inside the upload loop to support cancellation.

### Binary Data in the Browser
- For `.splat` file parsing (format: `[x:f32][y:f32][z:f32][scale_0..2:f32][rot_0..3:u8][opacity:u8][r:u8][g:u8][b:u8]` per Gaussian), use `DataView` for cross-endian safety.
- Never use `JSON.parse` or `TextDecoder` on raw binary buffers. Detect format by magic bytes or file extension before choosing a decoder.
- For `.spz` decompression or any CPU-bound Gaussian sort (view-dependent depth ordering), offload to a `Worker` via `new Worker(new URL('../workers/splat-sort.worker.ts', import.meta.url))`. Never block the main thread.
- Transfer typed arrays between the main thread and Worker using the `transfer` option (zero-copy): `worker.postMessage({ buffer }, [buffer])`.
- Do not load entire `.ply` or `.splat` files into a `string`. Stream or chunk-read using `ReadableStream` from a `fetch` response body.

---

## State Management

- Prefer React's built-in `useState` / `useReducer` / `useContext` for local and shared UI state. Do not introduce a global state library (Zustand, Redux) without explicit approval.
- Use `useCallback` to memoize handlers passed as props or used in `useEffect` dependency arrays.
- Use `useRef` for values that must persist across renders without triggering re-renders (e.g., `AbortController`, upload state maps, polling timers).
- Clean up all timers, intervals, and event listeners in `useEffect` return functions.

---

## Component Quality

- Use `shadcn/ui` primitives (`components/ui/`) as the base for all new UI elements. Do not re-implement buttons, progress bars, or dialogs from scratch.
- Do not pass raw inline styles. Use Tailwind utility classes. Keep class strings readable with `cn()` from `lib/utils.ts` for conditional classes.
- Avoid prop drilling beyond two levels. Use a Context or lift state to the nearest common ancestor.
- `Dropzone`, `ScenesDashboard`, `RightSidebar` are established compositions — extend them rather than duplicating layout logic.

---

## Performance

- Lazy-load heavy 3D rendering components with `next/dynamic` and `{ ssr: false }`. WebGL/WebGPU contexts must not run during SSR.
- Use `React.memo` on list-item components rendered inside `ScenesDashboard` or any virtualized list.
- Avoid `useEffect` with empty dependency arrays for data fetching — use React Server Components or a caching strategy via `fetch` with `cache: 'force-cache'` / `revalidate`.

---

## Phase-Based Output & Post-Execution Rules

After every frontend code change, append:

```
---
### Proposed Commit Message
feat(frontend): <subject>     # new component, page, or hook
fix(frontend): <subject>      # bug fix in UI layer
refactor(upload): <subject>   # hook restructure, no behavior change

### Verification Checklist
- [ ] cd site/my-app && npm run build — zero TypeScript compiler errors before merge.
- [ ] Manually test the affected user flow in the browser against the dev API endpoint.
- [ ] Check browser DevTools → Network tab: confirm no JWT is visible in localStorage.
```