# Splatial — Frontend

The Next.js web client for Splatial: authentication, scene upload, the in-browser
WebGL/WebGPU Gaussian-splat viewer, and the full social layer (profiles, feed,
explore, reactions, comments, notifications, bookmarks, shots, tours, remix).

> This is one package of a larger monorepo. For the system overview, architecture,
> and deployment, see the [root README](../README.md). For the social layer, see
> [`../docs/SOCIAL_FEATURES_REFERENCE.md`](../docs/SOCIAL_FEATURES_REFERENCE.md).

## Stack

- **Next.js 16** (App Router, static export) · **React 19** · **TypeScript** (strict)
- **Tailwind CSS v4** + **shadcn/ui**
- **AWS Amplify** (Cognito auth) · authenticated `fetch` via `services/apiClient.ts`
- **WebGL/WebGPU splat viewer** (`@mkkellogg/gaussian-splats-3d`, Three.js) under `viewer/`

## Develop

```bash
npm install
npm run dev        # http://localhost:3000 (proxies /api/* to the dev API Gateway)
```

The dev server rewrites `/api/*` to `NEXT_PUBLIC_API_GATEWAY_URL` to avoid CORS;
production builds export a static site (`output: 'export'`) deployed to S3 +
CloudFront.

## Verify before pushing

```bash
npm run lint       # ESLint (also enforced in CI)
npm run build      # type-check + static export; must pass with zero errors
```

## Layout

```
app/            App Router pages and layouts (auth-gated under (main)/)
api/            HTTP client + base URL resolution
services/       One authenticated API helper per domain (profiles, feed, reactions, …)
components/     UI (ui/, layout/, upload/, viewer/, scenes/, …)
hooks/          Custom hooks (upload/, viewer/)
viewer/         WebGL engine + camera/trajectory math (non-React)
types/          Shared TypeScript types (all API shapes in types/api.ts)
lib/            Auth bootstrap, helpers
```

## Conventions

- All authenticated calls go through `authenticatedFetch` (never raw `fetch` with
  tokens); the API base URL comes from `api/baseUrl.ts` — never hardcode stage URLs.
- No JWT/token storage in `localStorage`/`sessionStorage`; rely on Amplify's session.
- New API response shapes live in `types/api.ts`; `strict` is on — no `any`.
- Heavy 3D components are lazy-loaded (`next/dynamic`, `{ ssr: false }`).

See [`AGENTS.md`](./AGENTS.md) and the root [`CLAUDE.md`](../CLAUDE.md) for the full
engineering contract.
