# Scribe Auth — Setup & Deploy (Cloudflare)

Free stack: **Cloudflare Pages (SPA) + Worker (Hono + Better Auth) + D1 (SQLite) + Resend (email)**.

## Prerequisites
- `wrangler login` already done (browser auth).
- A free **Resend** account → API key (https://resend.com).
- A **Google AI Studio** key (already in `.env.local` for client; will also go server-side as a secret).

## 1. Create the D1 database
```bash
cd worker
npx wrangler d1 create scribe-auth-db
# Copy the returned database_id into wrangler.toml (database_id = "...")
```

## 2. Apply the schema (remote)
```bash
npx wrangler d1 execute scribe-auth-db --remote --file=./schema.sql
```

## 3. Set secrets (NEVER commit these)
```bash
npx wrangler secret put GEMINI_API_KEY          # from .env.local
npx wrangler secret put RESEND_API_KEY           # from Resend
npx wrangler secret put BETTER_AUTH_SECRET       # any long random string
npx wrangler secret put RESEND_SENDER            # verified sender domain, e.g. "NeoScriber <noreply@yourdomain.com>"
# Google OAuth (deferred — add later):
# npx wrangler secret put GOOGLE_CLIENT_ID
# npx wrangler secret put GOOGLE_CLIENT_SECRET
```

> **Important: Resend sender domain.** The default sender is `onboarding@resend.dev`, which is Resend's test-only domain that cannot send to real email addresses (Gmail, Yahoo, etc.). You must either:
> 1. **Verify a domain** in your Resend dashboard (Settings → Domains), then set `RESEND_SENDER` to something like `NeoScriber <noreply@yourdomain.com>`
> 2. Or use `delivered@resend.dev` for testing (Resend test inbox)

## 4. Set the Worker URL in wrangler.toml [vars]
```toml
[vars]
BETTER_AUTH_URL = "https://scribe-auth-worker.<your-subdomain>.workers.dev"
```
(Or set it as a secret. The `APP_NAME` var is optional.)

## 5. Deploy the Worker
```bash
npx wrangler deploy
```

## 6. Point the SPA at the Worker
In `.env.local` (Scribe root):
```
VITE_AUTH_URL=https://scribe-auth-worker.<your-subdomain>.workers.dev
```
Rebuild the SPA (`npm run build`) so the AuthGate client uses the right URL, then the
existing GitHub Pages workflow redeploys `dist/`.

## 7. (Later) Enable Google OAuth
Once the app is registered in Google Cloud Console, uncomment the `google:` block in
`worker/src/auth.ts`, add the two secrets (step 3), and redeploy.

## Feature gating (enforced server-side)
- Unauthenticated: 2-minute transcription cap (`FREE_TIER_SECONDS = 120` in
  `worker/src/index.ts`). Returns `402` if exceeded.
- Authenticated + verified: full features.
- Email verification is **required** (`requireEmailVerification: true`) — accounts are
  unusable until the Resend verification link is clicked.

## Security notes
- The Gemini key lives ONLY in the Worker (`GEMINI_API_KEY` secret). It is NOT in the
  SPA bundle (the client no longer calls Google directly for transcription — route
  through `/api/transcribe`).
- Passwords are hashed by Better Auth; verification tokens expire.
- PII (emails) is stored in D1. Add a privacy policy link before public launch.
