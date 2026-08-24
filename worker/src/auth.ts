import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { Resend } from "resend";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import type { D1Database } from "@cloudflare/workers-types";
import type { Env } from "./index";

/**
 * Builds the Better Auth instance backed by Cloudflare D1 (drizzle adapter).
 * Email verification is REQUIRED: a user cannot sign in until verified.
 */
// The Resend API key lives in the Worker secret by default, but the admin can
// override it at runtime via admin_config (key "resend_api_key") — e.g. to swap
// in a valid key without redeploying. The secret always wins as the source of
// truth if no override is stored. Resolved per-request so the override applies
// immediately after the admin saves it.
const RESEND_KEY_CONFIG_KEY = "resend_api_key";
const RESEND_SENDER_CONFIG_KEY = "resend_sender";
async function resolveResendKey(db: D1Database, secretKey: string): Promise<string> {
  const row = await db.prepare(`SELECT value FROM admin_config WHERE key = ?`)
    .bind(RESEND_KEY_CONFIG_KEY).first<{ value: string }>();
  return row?.value?.trim() ? row.value.trim() : secretKey;
}
async function resolveResendSender(db: D1Database, secretSender: string): Promise<string> {
  // Admin config override wins, then the Worker secret, then the hard-coded default
  const row = await db.prepare(`SELECT value FROM admin_config WHERE key = ?`)
    .bind(RESEND_SENDER_CONFIG_KEY).first<{ value: string }>();
  return row?.value?.trim() ? row.value.trim() : (secretSender || "onboarding@resend.dev");
}
export { resolveResendSender };

export async function createAuth(db: D1Database, env: Env) {

  // Cloudflare D1's prepared statement *rejects* values it can't store:
  //   - JS booleans (`false`/`true`) — Better Auth binds `emailVerified` as one.
  //   - JS `Date` objects — Better Auth binds `createdAt`/`updatedAt` as these
  //     when the adapter reports `supportsDates: true` (the drizzle adapter's
  //     default). D1 only accepts string/number/null/ArrayBuffer.
  // So we coerce booleans → 0/1 and Dates → ISO strings everywhere a value is
  // bound.
  //
  // There are two bind paths the drizzle D1 adapter uses:
  //   1. Plain statements: `stmt.bind(...params)` — patched via `prepare`.
  //   2. RETURNING (and transactions): drizzle uses `db.batch([stmt])` and binds
  //      each stmt with `preparedQuery.stmt.bind(...params)` BEFORE calling our
  //      patched `.bind`, so path 1 alone is NOT enough. We also wrap `.batch`
  //      here to coerce params on every statement it contains.
  //
  // IMPORTANT: a D1Database is a Cloudflare *host object*. Spreading it
  // (`{...db}`) drops its prototype methods (batch/exec/...) and native state,
  // which silently breaks the drizzle adapter. Use a Proxy instead: intercept
  // ONLY `.prepare` and `.batch`, delegate every other property to the real db.
  const coerce = (p: any) => {
    if (typeof p === "boolean") return p ? 1 : 0;
    if (p instanceof Date) return p.toISOString();
    return p;
  };
  const safeDb = new Proxy(db, {
    get(target, prop) {
      if (prop === "prepare") {
        return (query: string) => {
          const stmt = target.prepare(query) as any;
          const origBind = stmt.bind.bind(stmt);
          stmt.bind = (...params: any[]) => origBind(...params.map(coerce));
          return stmt;
        };
      }
      if (prop === "batch") {
        return (statements: any[]) =>
          target.batch(
            statements.map((stmt) => {
              // Coerce any boolean/Date bind params before the real batch binds.
              const origBind = stmt.bind.bind(stmt);
              stmt.bind = (...params: any[]) => origBind(...params.map(coerce));
              return stmt;
            })
          );
      }
      // @ts-expect-error index access on host object
      return target[prop];
    },
  }) as D1Database;

  const orm = drizzle(safeDb, { schema });

  // Better Auth enforces its own origin check on every request (separate from
  // the Worker's CORS middleware). The front-end origins must be trusted here or
  // sign-up/sign-in fail with INVALID_ORIGIN.
  const trustedOrigins = [
    env.BETTER_AUTH_URL,
    "https://marcpadz.github.io",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:8787",
  ].filter(Boolean) as string[];

  // Resolve the (possibly overridden) Resend key for this request, then build
  // the Resend client. We do this inside createAuth because the override lives
  // in the DB and must be re-read per call.
  const resendKey = await resolveResendKey(db, env.RESEND_API_KEY);
  const resendSender = await resolveResendSender(db, env.RESEND_SENDER ?? "");
  const resend = new Resend(resendKey);

  return betterAuth({
    database: drizzleAdapter(orm, {
      provider: "sqlite",
      usePlural: false, // D1 tables are singular (user, session, account, verification)
    }),
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins,

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true, // account unusable until verified
    },

    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }: { user: { email: string; name?: string }; url: string }) => {
          const result = await resend.emails.send({
            from: resendSender || "NeoScriber <onboarding@resend.dev>",
            to: user.email,
            subject: "Verify your NeoScriber account",
            html: `
              <h2>Welcome to NeoScriber</h2>
              <p>Confirm your email to activate your account:</p>
              <p>
                <a href="${url}" style="background:#FFE900;color:#1A1A1A;padding:10px 18px;border:2px solid #1A1A1A;text-decoration:none;font-weight:700;display:inline-block;">
                  Verify my email
                </a>
              </p>
              <p style="color:#666;font-size:13px;">If the button doesn't work, copy this link: ${url}</p>
            `,
          });
          console.log(`Verification email sent to ${user.email}: ${JSON.stringify(result)}`);
        },
    },

    socialProviders: {
      // Google OAuth deferred until the app is registered with Google.
      // Uncomment + add GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET secrets when ready.
      // google: { clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET! },
    },

    basePath: "/api/auth",
  });
}
