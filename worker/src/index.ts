import { Hono } from "hono";
import { createAuth, resolveResendSender } from "./auth";
import {
  DEFAULT_MODELS,
  EngineModels,
  transcribeAudio,
  analyzeVideoFrames,
  chatWithGemini,
} from "./gemini";
import type { D1Database } from "@cloudflare/workers-types";

export interface Env {
  DB: D1Database;
  GEMINI_API_KEY: string;
  RESEND_API_KEY: string;
  RESEND_SENDER?: string; // configurable from address (e.g. "NeoScriber <noreply@yourdomain.com>")
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  ADMIN_KEY: string; // bearer token for the admin dashboard
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

const app = new Hono<{ Bindings: Env }>();

// --- Feature gating: enforced server-side (never trust the client) ---
const FREE_TIER_SECONDS = 120; // 2-minute cap for unauthenticated users
const ADMIN_CONFIG_KEY = "engine_models";

// Credentialed CORS — MUST be mounted BEFORE the /api/auth/* route, otherwise
// Hono runs the auth handler (a route) ahead of this middleware and the
// preflight OPTIONS response ships without CORS headers, blocking cross-origin
// auth calls. Only allow the Scribe front-end + local dev, echo credentials so
// auth cookies survive cross-origin.
const ALLOWED_ORIGINS = new Set([
  "https://marcpadz.github.io",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8787",
]);

app.use("*", async (c, next) => {
  const origin = c.req.header("Origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Access-Control-Allow-Credentials", "true");
    c.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Admin-Key");
    c.header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  }
  if (c.req.method === "OPTIONS") {
    return c.body(null, 204);
  }
  await next();
});

// ============================================================================
// Token-based auth endpoints (bypasses cross-origin cookie issues)
// MUST be registered BEFORE the /api/auth/* catch-all below.
// The frontend (GitHub Pages) can't use cookies cross-origin. These endpoints
// accept JSON, return the session token as JSON, and the client stores it in
// localStorage to send as Authorization: Bearer <token>.
// ============================================================================

// POST /api/auth/token/sign-up — create account + send verification email
app.post("/api/auth/token/sign-up", async (c) => {
  const auth = await createAuth(c.env.DB, c.env);
  const body = await c.req.json<{ email: string; password: string; name?: string }>().catch(() => null);
  if (!body?.email || !body?.password) {
    return c.json({ error: "Email and password are required" }, 400);
  }
  // Check if using the test sender (won't work for real emails)
  let isTestSender = false;
  try {
    const resendSender = await resolveResendSender(c.env.DB, c.env.RESEND_SENDER ?? "");
    isTestSender = resendSender.includes("onboarding@resend.dev");
  } catch {
    isTestSender = true; // assume test sender on error
  }

  try {
    const result = await auth.api.signUpEmail({
      body: {
        email: body.email,
        password: body.password,
        name: body.name || body.email.split("@")[0],
      },
      headers: c.req.raw.headers,
    });
    // Better Auth returns { token: null, user } for existing emails (no throw).
    // Check token to distinguish new vs. existing user.
    if (!(result as any).token) {
      return c.json({
        user: { id: result.user.id, email: result.user.email, name: result.user.name, emailVerified: result.user.emailVerified },
        needsVerification: !result.user.emailVerified,
        alreadyExists: true,
        emailWarning: isTestSender ? "Email delivery may fail — onboarding@resend.dev is a test sender. Set RESEND_SENDER to a verified domain." : undefined,
      }, 200);
    }
    // Create a free profile for the new user (INSERT OR IGNORE as safety net)
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO profile (userId, plan, totalSecondsTranscribed, createdAt) VALUES (?, 'free', 0, ?)`
    ).bind(result.user.id, nowIso()).run();
    return c.json({
      user: { id: result.user.id, email: result.user.email, name: result.user.name, emailVerified: result.user.emailVerified },
      needsVerification: true,
      emailWarning: isTestSender ? "Email delivery may fail — onboarding@resend.dev is a test sender. Set RESEND_SENDER to a verified domain." : undefined,
    }, 200);
  } catch (err: any) {
    console.error("Sign-up failed:", err);
    const msg = err?.message || String(err);
    if (msg.includes("already registered") || msg.includes("taken")) {
      return c.json({ error: "An account with this email already exists." }, 409);
    }
    return c.json({ error: msg || "Sign-up failed" }, 500);
  }
});

// POST /api/auth/token/sign-in — authenticate and return session token
app.post("/api/auth/token/sign-in", async (c) => {
  const auth = await createAuth(c.env.DB, c.env);
  const body = await c.req.json<{ email: string; password: string }>().catch(() => null);
  if (!body?.email || !body?.password) {
    return c.json({ error: "Email and password are required" }, 400);
  }
  try {
    const result = await auth.api.signInEmail({
      body: { email: body.email, password: body.password },
      headers: c.req.raw.headers,
    });
    // result is { token, user, redirect, url }
    const token = (result as any).token as string | undefined;
    const user = (result as any).user;
    return c.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, emailVerified: user.emailVerified },
      needsVerification: !user.emailVerified,
    }, 200);
  } catch (err: any) {
    console.error("Sign-in failed:", err);
    const msg = err?.message || String(err);
    if (msg.includes("Email not verified") || err?.code === "EMAIL_NOT_VERIFIED") {
      return c.json({ error: "Email not verified. Check your inbox and click the verification link.", needsVerification: true }, 403);
    }
    if (msg.includes("Invalid") || msg.includes("password") || msg.includes("credentials")) {
      return c.json({ error: "Invalid email or password." }, 401);
    }
    return c.json({ error: msg || "Sign-in failed" }, 500);
  }
});

// POST /api/auth/token/resend-verification — re-send verification email
app.post("/api/auth/token/resend-verification", async (c) => {
  const auth = await createAuth(c.env.DB, c.env);
  const body = await c.req.json<{ email: string }>().catch(() => null);
  if (!body?.email) {
    return c.json({ error: "Email is required" }, 400);
  }
  try {
    await auth.api.sendVerificationEmail({
      body: { email: body.email },
      headers: c.req.raw.headers,
    });
    return c.json({ sent: true }, 200);
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.error("Resend verification failed:", msg);
    return c.json({ error: msg || "Failed to resend verification email" }, 500);
  }
});

// GET /api/auth/token/session — validate Bearer token against session table
app.get("/api/auth/token/session", async (c) => {
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return c.json({ authenticated: false, limitSeconds: FREE_TIER_SECONDS }, 200);
  }
  // Validate token directly against D1 (Better Auth's getSession doesn't read Bearer tokens)
  const db = c.env.DB as D1Database;
  const row = await db.prepare(
    `SELECT s.*, u.email, u.name, u."emailVerified" FROM "session" s
     JOIN "user" u ON s."userId" = u.id
     WHERE s.token = ? AND s."expiresAt" > ?`
  ).bind(token, nowIso()).first<{
    userId: string;
    email: string;
    name: string;
    emailVerified: number;
  }>();
  if (!row) {
    return c.json({ authenticated: false, limitSeconds: FREE_TIER_SECONDS }, 200);
  }
  const profile = await db.prepare(
    `SELECT plan FROM profile WHERE userId = ?`
  ).bind(row.userId).first<{ plan: string }>();
  const isPro = profile?.plan === "pro";
  return c.json({
    authenticated: true,
    email: row.email,
    emailVerified: Boolean(row.emailVerified),
    name: row.name,
    plan: profile?.plan ?? "free",
    limitSeconds: isPro ? Number.MAX_SAFE_INTEGER : FREE_TIER_SECONDS,
  }, 200);
});

// --- Better Auth handler (mounted AFTER token routes so preflight passes) ---
app.all("/api/auth/*", async (c) => {
  const auth = await createAuth(c.env.DB, c.env);
  return auth.handler(c.req.raw);
});

// ============================================================================
// Helpers
// ============================================================================

async function loadModels(db: D1Database): Promise<EngineModels> {
  const row = await db.prepare(`SELECT value FROM admin_config WHERE key = ?`)
    .bind(ADMIN_CONFIG_KEY).first<{ value: string }>();
  if (!row?.value) return DEFAULT_MODELS;
  try {
    const parsed = JSON.parse(row.value) as Partial<EngineModels>;
    return {
      transcription: parsed.transcription ?? DEFAULT_MODELS.transcription,
      videoAnalysis: parsed.videoAnalysis ?? DEFAULT_MODELS.videoAnalysis,
      chat: parsed.chat ?? DEFAULT_MODELS.chat,
    };
  } catch {
    return DEFAULT_MODELS;
  }
}

const API_KEY_CONFIG_KEY = "gemini_api_key";

async function getConfigValue(db: D1Database, key: string): Promise<string> {
  const row = await db.prepare(`SELECT value FROM admin_config WHERE key = ?`)
    .bind(key).first<{ value: string }>();
  return row?.value?.trim() ?? "";
}

async function setConfigValue(db: D1Database, key: string, value: string): Promise<void> {
  if (!value) {
    await db.prepare(`DELETE FROM admin_config WHERE key = ?`).bind(key).run();
    return;
  }
  await db.prepare(
    `INSERT INTO admin_config (key, value, updatedAt) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`
  ).bind(key, value, nowIso()).run();
}

async function loadApiKey(db: D1Database, secretKey: string): Promise<string> {
  const override = await getConfigValue(db, API_KEY_CONFIG_KEY);
  return override || secretKey;
}

function newId(): string {
  return crypto.randomUUID();
}
function nowIso(): string {
  return new Date().toISOString();
}

async function logJob(
  db: D1Database,
  job: {
    type: string;
    userId?: string | null;
    status: string;
    model?: string;
    durationSeconds?: number;
    frames?: number;
    error?: string;
    finishedAt?: boolean;
  }
): Promise<string> {
  const id = newId();
  await db.prepare(
    `INSERT INTO job (id, type, userId, status, model, durationSeconds, frames, error, createdAt, finishedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      job.type,
      job.userId ?? null,
      job.status,
      job.model ?? null,
      job.durationSeconds ?? null,
      job.frames ?? null,
      job.error ?? null,
      nowIso(),
      job.finishedAt ? nowIso() : null
    )
    .run();
  return id;
}

/**
 * Extracts the Better Auth session, checking Authorization: Bearer <token> first
 * (for cross-origin clients) then falling back to cookie-based sessions.
 */
async function getSession(c: any): Promise<any> {
  const auth = await createAuth(c.env.DB, c.env);
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    // Validate token directly against D1 session table (Better Auth doesn't
    // support Bearer-token session lookup natively)
    const db = c.env.DB as D1Database;
    const row = await db.prepare(
      `SELECT s.*, u.email, u.name, u."emailVerified" FROM "session" s
       JOIN "user" u ON s."userId" = u.id
       WHERE s.token = ? AND s."expiresAt" > ?`
    ).bind(token, nowIso()).first<{
      userId: string;
      email: string;
      name: string;
      emailVerified: number;
    }>();
    if (row) {
      return { user: { id: row.userId, email: row.email, name: row.name, emailVerified: row.emailVerified } };
    }
    return null;
  }
  const headers = authHeader
    ? new Headers({ ...Object.fromEntries(c.req.raw.headers), authorization: authHeader })
    : c.req.raw.headers;
  return auth.api.getSession({ headers });
}

// ============================================================================
// App endpoints
// ============================================================================

app.get("/api/me", async (c) => {
  const session = await getSession(c);
  if (!session?.user) {
    return c.json({ authenticated: false, limitSeconds: FREE_TIER_SECONDS }, 200);
  }
  const profile = await c.env.DB.prepare(
    `SELECT plan FROM profile WHERE userId = ?`
  ).bind(session.user.id).first<{ plan: string }>();
  const isPro = profile?.plan === "pro";
  return c.json({
    authenticated: true,
    email: session.user.email,
    emailVerified: Boolean(session.user.emailVerified),
    name: session.user.name,
    plan: profile?.plan ?? "free",
    limitSeconds: isPro ? Number.MAX_SAFE_INTEGER : FREE_TIER_SECONDS,
  }, 200);
});

// --- Gemma / Gemini engine: audio transcription ---
app.post("/api/transcribe", async (c) => {
  const session = await getSession(c);

  const body = await c.req
    .json<{ audioBase64: string; mimeType?: string; durationSeconds?: number }>()
    .catch(() => null);
  if (!body?.audioBase64) {
    return c.json({ error: "Missing audio" }, 400);
  }

  const isAuthed = Boolean(session?.user);
  const duration = Number(body.durationSeconds ?? 0);
  if (!isAuthed && duration > FREE_TIER_SECONDS) {
    return c.json(
      { error: "Free tier limited to 2 minutes. Sign up to unlock full length." },
      402
    );
  }

  const models = await loadModels(c.env.DB);
  const apiKey = await loadApiKey(c.env.DB, c.env.GEMINI_API_KEY);
  const jobId = await logJob(c.env.DB, {
    type: "transcribe",
    userId: session?.user?.id,
    status: "running",
    model: models.transcription,
    durationSeconds: duration,
  });

  try {
    const result = await transcribeAudio(
      apiKey,
      models,
      body.audioBase64,
      body.mimeType ?? "audio/wav"
    );
    await c.env.DB.prepare(`UPDATE job SET status = 'done', finishedAt = ? WHERE id = ?`)
      .bind(nowIso(), jobId).run();
    return c.json({ ...result, authed: isAuthed }, 200);
  } catch (err: any) {
    console.error("Transcription failed:", err);
    await c.env.DB.prepare(`UPDATE job SET status = 'error', error = ?, finishedAt = ? WHERE id = ?`)
      .bind(String(err?.message || err).slice(0, 500), nowIso(), jobId).run();
    return c.json({ error: "Transcription failed. Please try again." }, 502);
  }
});

// --- Engine: video understanding (frame analysis) ---
app.post("/api/analyze", async (c) => {
  const session = await getSession(c);
  if (!session?.user) {
    return c.json({ error: "Sign in to use video understanding." }, 401);
  }

  const body = await c.req
    .json<{ frames: string[]; prompt?: string }>()
    .catch(() => null);
  if (!body?.frames?.length) {
    return c.json({ error: "Missing frames" }, 400);
  }

  const models = await loadModels(c.env.DB);
  const apiKey = await loadApiKey(c.env.DB, c.env.GEMINI_API_KEY);
  const jobId = await logJob(c.env.DB, {
    type: "analyze",
    userId: session.user.id,
    status: "running",
    model: models.videoAnalysis,
    frames: body.frames.length,
  });

  try {
    const result = await analyzeVideoFrames(
      apiKey,
      models,
      body.frames,
      body.prompt
    );
    await c.env.DB.prepare(`UPDATE job SET status = 'done', finishedAt = ? WHERE id = ?`)
      .bind(nowIso(), jobId).run();
    return c.json({ analysis: result }, 200);
  } catch (err: any) {
    console.error("Video analysis failed:", err);
    await c.env.DB.prepare(`UPDATE job SET status = 'error', error = ?, finishedAt = ? WHERE id = ?`)
      .bind(String(err?.message || err).slice(0, 500), nowIso(), jobId).run();
    return c.json({ error: "Video analysis failed. Please try again." }, 502);
  }
});

// --- Engine: transcript-grounded chat ---
app.post("/api/chat", async (c) => {
  const session = await getSession(c);
  if (!session?.user) {
    return c.json({ error: "Sign in to use the assistant." }, 401);
  }

  const body = await c.req
    .json<{
      history: { role: string; parts: { text: string }[] }[];
      message: string;
      context: string;
    }>()
    .catch(() => null);
  if (!body?.message) {
    return c.json({ error: "Missing message" }, 400);
  }

  const models = await loadModels(c.env.DB);
  const apiKey = await loadApiKey(c.env.DB, c.env.GEMINI_API_KEY);
  const jobId = await logJob(c.env.DB, {
    type: "chat",
    userId: session.user.id,
    status: "running",
    model: models.chat,
  });

  try {
    const reply = await chatWithGemini(
      apiKey,
      models,
      body.history ?? [],
      body.message,
      body.context ?? ""
    );
    await c.env.DB.prepare(`UPDATE job SET status = 'done', finishedAt = ? WHERE id = ?`)
      .bind(nowIso(), jobId).run();
    return c.json({ reply }, 200);
  } catch (err: any) {
    console.error("Chat failed:", err);
    await c.env.DB.prepare(`UPDATE job SET status = 'error', error = ?, finishedAt = ? WHERE id = ?`)
      .bind(String(err?.message || err).slice(0, 500), nowIso(), jobId).run();
    return c.json({ error: "Chat failed. Please try again." }, 502);
  }
});

// ============ ADMIN DASHBOARD (protected by X-Admin-Key header) ============
const requireAdmin = async (c: any, next: any) => {
  const key = c.req.header("X-Admin-Key") || c.req.query("adminKey");
  if (!key || key !== c.env.ADMIN_KEY) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
};

// Config: current engine models + api key status
app.get("/api/admin/config", requireAdmin, async (c) => {
  const models = await loadModels(c.env.DB);
  const keyOverride = Boolean(await getConfigValue(c.env.DB, API_KEY_CONFIG_KEY));
  const resendOverride = Boolean(await getConfigValue(c.env.DB, "resend_api_key"));
  return c.json({
    key: ADMIN_CONFIG_KEY,
    models,
    defaults: DEFAULT_MODELS,
    apiKey: { set: Boolean(c.env.GEMINI_API_KEY), overridden: keyOverride },
    resendKey: { set: Boolean(c.env.RESEND_API_KEY), overridden: resendOverride },
  }, 200);
});

// Config: update engine models
app.put("/api/admin/config", requireAdmin, async (c) => {
  const body = await c.req.json<EngineModels>().catch(() => null);
  if (!body || !body.transcription || !body.videoAnalysis || !body.chat) {
    return c.json({ error: "transcription, videoAnalysis and chat are required" }, 400);
  }
  await c.env.DB.prepare(
    `INSERT INTO admin_config (key, value, updatedAt) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`
  ).bind(ADMIN_CONFIG_KEY, JSON.stringify(body), nowIso()).run();
  return c.json({ models: body }, 200);
});

// API key: get current (returns only whether a key is configured, never the secret)
app.get("/api/admin/apikey", requireAdmin, async (c) => {
  const row = await c.env.DB.prepare(`SELECT value FROM admin_config WHERE key = ?`)
    .bind(API_KEY_CONFIG_KEY).first<{ value: string }>();
  return c.json({ set: Boolean(c.env.GEMINI_API_KEY), overridden: Boolean(row?.value?.trim()) }, 200);
});

// API key: set/override (stored in admin_config; empty body clears the override)
app.put("/api/admin/apikey", requireAdmin, async (c) => {
  const body = await c.req.json<{ key?: string }>().catch((): { key?: string } => ({}));
  const value = (body.key ?? "").trim();
  await setConfigValue(c.env.DB, API_KEY_CONFIG_KEY, value);
  return c.json(
    { overridden: Boolean(value), message: value ? "API key override saved" : "Reverted to Worker secret key" },
    200
  );
});

// --- Resend (email) API key: same override pattern as the Gemini key ---
const RESEND_KEY_CONFIG_KEY = "resend_api_key";

// Resend key: get current (returns only whether a key is configured, never the secret)
app.get("/api/admin/resendkey", requireAdmin, async (c) => {
  const overridden = Boolean(await getConfigValue(c.env.DB, RESEND_KEY_CONFIG_KEY));
  return c.json({ set: Boolean(c.env.RESEND_API_KEY), overridden }, 200);
});

// Resend key: set/override (stored in admin_config; empty body clears the override).
app.put("/api/admin/resendkey", requireAdmin, async (c) => {
  const body = await c.req.json<{ key?: string }>().catch((): { key?: string } => ({}));
  const value = (body.key ?? "").trim();
  await setConfigValue(c.env.DB, RESEND_KEY_CONFIG_KEY, value);
  return c.json(
    { overridden: Boolean(value), message: value ? "Resend key override saved" : "Reverted to Worker secret key" },
    200
  );
});

// Available Gemini models (for the dropdown). Fetched from the live API so the
// list is always current. Audio-capable models are flagged for the transcription
// dropdown; Gemma models are excluded from transcription (no audio modality).
app.get("/api/admin/models", requireAdmin, async (c) => {
  try {
    const apiKey = await loadApiKey(c.env.DB, c.env.GEMINI_API_KEY);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { headers: { "x-goog-api-key": apiKey } }
    );
    const data = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
    const names = (data.models ?? [])
      .map((m) => m.name.replace(/^models\//, ""))
      .filter((n) => /gemini|gemma/i.test(n))
      .sort();
    return c.json({ models: names }, 200);
  } catch (err: any) {
    return c.json({ models: [], error: String(err?.message || err).slice(0, 200) }, 200);
  }
});

// DB viewer: list tables (safe, read-only metadata)
app.get("/api/admin/db/tables", requireAdmin, async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name`
  ).all<{ name: string }>();
  return c.json({ tables: rows.results.map((r) => r.name) }, 200);
});

// DB viewer: read rows from a table (read-only, capped)
app.get("/api/admin/db/table/:name", requireAdmin, async (c) => {
  const name = c.req.param("name");
  const allowed = new Set([
    "user", "session", "account", "verification", "profile",
    "admin_config", "job",
  ]);
  if (!allowed.has(name)) {
    return c.json({ error: "Table not viewable" }, 403);
  }
  const limit = Math.min(Number(c.req.query("limit") ?? 100), 500);
  const offset = Math.max(Number(c.req.query("offset") ?? 0), 0);
  const data = await c.env.DB.prepare(
    `SELECT * FROM "${name}" ORDER BY rowid DESC LIMIT ? OFFSET ?`
  ).bind(limit, offset).all<any>();
  const count = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).first<{ n: number }>();
  return c.json({ table: name, rows: data.results, total: count?.n ?? 0 }, 200);
});

// Process monitor: recent engine jobs (status/condition)
app.get("/api/admin/jobs", requireAdmin, async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 100), 500);
  const rows = await c.env.DB.prepare(
    `SELECT * FROM job ORDER BY createdAt DESC LIMIT ?`
  ).bind(limit).all<any>();
  const stats = await c.env.DB.prepare(
    `SELECT status, COUNT(*) AS n FROM job GROUP BY status`
  ).all<{ status: string; n: number }>();
  const byType = await c.env.DB.prepare(
    `SELECT type, COUNT(*) AS n FROM job GROUP BY type`
  ).all<{ type: string; n: number }>();
  return c.json({ jobs: rows.results, stats: stats.results, byType: byType.results }, 200);
});

// Overall health snapshot for the dashboard
app.get("/api/admin/health", requireAdmin, async (c) => {
  const models = await loadModels(c.env.DB);
  const users = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM user`).first<{ n: number }>();
  const jobs = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM job`).first<{ n: number }>();
  const running = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM job WHERE status = 'running'`
  ).first<{ n: number }>();
  const errors = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM job WHERE status = 'error'`
  ).first<{ n: number }>();
  return c.json({
    status: "ok",
    models,
    freeTierSeconds: FREE_TIER_SECONDS,
    counts: {
      users: users?.n ?? 0,
      totalJobs: jobs?.n ?? 0,
      running: running?.n ?? 0,
      errors: errors?.n ?? 0,
    },
    generatedAt: nowIso(),
  }, 200);
});

export default app;
