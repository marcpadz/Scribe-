# Token-Based Auth for Cross-Origin SPA

**Date:** 2026-08-24
**Problem:** Better Auth v1.7 uses HTTP-only cookies for sessions by default. When the SPA is served from GitHub Pages (`marcpadz.github.io`) and the auth Worker is on a different domain (`scribe-auth-worker.marcpadz.workers.dev`), the browser blocks cross-origin cookies due to SameSite policy. This caused sign-up to appear to work (200 response) but sign-in to silently fail with a "failed fetch" error because no session was established.

**Solution:** Bypass cookie-based sessions entirely. After sign-in, extract the session token from the Better Auth response and store it in `localStorage`. All subsequent requests send `Authorization: Bearer <token>`. The Worker validates tokens by querying the D1 `session` table directly (Better Auth's `getSession` doesn't read Authorization headers natively).

**Key changes:**
1. Added custom `/api/auth/token/sign-up`, `/sign-in`, `/resend-verification`, `/session` endpoints in `worker/src/index.ts`
2. `AuthGate.tsx` rewritten to use direct `fetch` calls instead of `better-auth/react` hooks
3. Token stored in `localStorage` under `neoscriber_auth_token` / `neoscriber_auth_user`
4. `App.tsx` restores session from token on mount via `/api/auth/token/session`
5. `geminiService.ts` sends `Authorization: Bearer` header on all engine requests
6. Fixed `sendVerificationEmail` callback placement (must be in `emailVerification`, not `emailAndPassword`)
7. Token routes registered BEFORE the `/api/auth/*` catch-all (Hono matches in registration order)

**Learnings:**
- Better Auth's `getSession` reads cookies, not Authorization headers — custom D1 lookup needed for token validation
- Hono route registration order matters: specific routes before catch-alls
- `sendVerificationEmail` in Better Auth must be under `emailVerification.sendVerificationEmail`, not `emailAndPassword`
- `auth.api.signUpEmail({ body: {...}, headers })` requires `{ body, headers }` wrapper, not direct params
