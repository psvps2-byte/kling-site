# Copilot / AI Agent Instructions for kling-site

This file contains concise, actionable guidance for AI coding agents working on this repository.

1. Project overview
- Type: Next.js (App Router) TypeScript app located under `app/`.
- Primary feature: client-side image generation UI that talks to a backend image-generation service via serverless routes in `app/api/`.

2. Key files and what they show
- `app/page.tsx`: client UI; creates tasks by POSTing to `/api/generate`, polls `/api/status`, saves results to `localStorage` under key `history`, and uses `app/i18n.ts` for translations.
- `app/i18n.ts` and `app/messages/*.json`: simple i18n via `getLang()/setLang()` stored in `localStorage` and `t(lang)` to load messages.
- `app/api/generate/route.ts` and `app/api/status/route.ts`: server routes that sign short-lived JWTs with `jose` (`SignJWT`) and forward requests to an external KLING API.
- `app/history/page.tsx`: reads `history` from `localStorage` and provides previews.
- `package.json`: scripts `dev`, `build`, `start`, `lint` and key deps (Next 16, React 19, `jose`).

3. Environment & secrets
- Required env vars for runtime: `KLING_BASE_URL`, `KLING_ACCESS_KEY`, `KLING_SECRET_KEY` (used in both `generate` and `status` routes). If missing, routes return 500 with a localized message.
- Tokens are created with a 30 minute expiry (`exp = now + 1800`) and `nbf = now - 5` in `route.ts` files.

4. Important implementation patterns and conventions
- App Router + client components: Files that run in browser include `"use client"` at top (see `app/page.tsx`, `app/history/page.tsx`). Prefer explicit client/server separation.
- LocalStorage usage: `lang` and `history` keys. When modifying history, code protects against invalid JSON and ignores storage errors.
- Polling behaviour: `app/page.tsx` polls status up to 45 times with a 2s delay — be careful when changing timing or loop counts.
- Error handling: server routes parse the remote response as text then JSON; non-OK upstream responses are returned with `{ error: ..., details: ... }`.
- Minimal styling: inline styles are used heavily in pages; Tailwind is listed as a dev dependency but most UI is inline/CSS in `globals.css`.

5. Testing, build and dev workflows
- Local dev: `npm run dev` (Next dev server). Build: `npm run build`. Start production: `npm run start`.
- Linting: `npm run lint` (uses `eslint`). There are no tests in the repo.

6. Integration notes for agents implementing features
- When touching server routes that call KLING, preserve JWT signing behaviour in `app/api/*/route.ts` (uses `jose` and `TextEncoder` for secret).
- New server-side logic should run in the app router route handlers (not client) to keep secrets server-only.
- Use the existing JSON message files in `app/messages/` for any user-facing strings; update both `uk.json` and `en.json` together.

7. Security and secrets handling
- Never expose `KLING_SECRET_KEY` to client code. All uses must remain on server routes.
- Avoid logging sensitive env values. Keep `.env.local` with required keys for local testing.

8. Helpful examples (copy-paste snippets)
- Calling the generate route (client): see `app/page.tsx` — POST JSON to `/api/generate` and read `data?.data?.task_id`.
- Polling status: call `/api/status?task_id=...`, look for `data?.task_status === 'succeed'` and `data?.task_result?.images`.

9. When to ask the maintainer
- Clarify desired polling timeout/count changes or quota concerns for KLING API.
- Confirm any change that would expose additional user metadata in `history` stored in `localStorage`.

If anything here is unclear or you'd like more detail about a specific area (auth, polling, i18n, or build), tell me which section to expand.
