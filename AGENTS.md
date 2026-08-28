# Scribe (NeoScriber)

> **AGENT DIRECTIVE — Read this first, every session.**
> This document governs how you work in this workspace. Do not skip it.
> Last updated: 2026-08-28

---

## Thinking Chain (run before every task)

1. **Read this file (`AGENTS.md`)** — the canonical glossary, current state, and active
   priorities. This is the single most commonly skipped step and the biggest cause of
   drift. Read it now.
2. **Load the matching playbook** in `.agent-continuity/playbooks/` *before* doing the
   work that playbook governs.
3. **Consult the store before acting** — search `.agent-continuity/learnings/` (and the
   symptom table in `learnings/_index.md`) before tackling a problem; read relevant
   decisions in `.agent-continuity/decisions/` before a cross-cutting choice.
4. **Write back when done** — record what you learned (a new decision, a lesson learned)
   so the next agent inherits it.

Background agents given a task without this context must ask the parent agent for it.

---

## Domain Glossary

| Term | Definition |
|---|---|
| Scribe / NeoScriber | The app — a neo-brutalist AI audio/video transcription tool |
| Transcript | Timed text segments produced by Gemini from media |
| Segment | One transcript line with `start`, `end`, `text` (seconds) |
| Project | A saved unit: transcript + bookmarks + mediaType + sourceType |
| sourceType | `local` (download JSON / localStorage) or `drive` (Google Drive) |
| Relinking | Re-attaching media to a loaded project (blob isn't persisted in JSON) |
| Cobalt | External API used to extract social-media media URLs (YouTube, TikTok, etc.) |
| Proxy | Cloudflare Worker (`functions/proxy.ts`) that bypasses browser CORS |

---

## Current State

- **Phase:** MVP functional, **shippable blockers resolved**
- **Status:** Ready for deployment (all 4 blockers fixed)
- **Last updated:** 2026-08-28
- **Active priorities:**
  1. ✅ Tailwind CDN replaced with proper build pipeline
  2. ✅ Google Client ID wired via Vite `define`
  3. ✅ Video transcription fixed (MIME type detection)
  4. ✅ Model routing resolved (server-side, verified model names)

---

## Invariants

- [x] Transcribe model must be a real, available Gemini model name
- [x] Google Drive features require `REACT_APP_GOOGLE_CLIENT_ID` + `API_KEY` wired through Vite `define`
- [x] No CDN Tailwind in production (`cdn.tailwindcss.com`)
- [x] The CORS proxy must not remain an open, unauthenticated proxy (rate-limited)

---

## Shippability Assessment (2026-08-28)

**What works (MVP complete):**
Record · upload · link import (Cobalt) · Google Drive import/save · chunked transcription ·
auto-scroll transcript · speed/bookmarks/seek · clip export (WAV) · AI chat on
transcript · video frame analysis · light/dark theme · local save/open (.neoscriber).

**Resolved blockers (2026-08-28):**
1. **✅ Tailwind CDN removed.** Now uses proper build pipeline with `postcss.config.js` and `tailwindcss` in devDependencies.
2. **✅ Google Client ID wired.** `REACT_APP_GOOGLE_CLIENT_ID` injected via Vite `define` in `vite.config.ts`.
3. **✅ Video transcription fixed.** `extractAudioFromVideo()` returns `audio/webm`, now correctly detected and passed to API (was hardcoded `audio/wav`).
4. **✅ Model routing resolved.** Server-side engine uses `gemini-3.5-flash-lite` (transcription) and `gemini-3.1-flash-lite` (video/chat). Client `MODELS` object updated to match.

**Current implementation status:**
- **Cobalt integration:** Updated to v8+ API format with configurable instance URL and API key support
- **Rate limiting:** 30 requests per IP per 60 seconds (in-memory sliding window)
- **Error handling:** Improved UX with specific error messages for different failure modes
- **TypeScript:** Fixed `any[]` type smell in `App.tsx` (now `TranscriptSegment[]`)

**For deployment:**
- Set `COBALT_API_URL` and `COBALT_API_KEY` in Worker environment (or leave empty for default instance)
- Set `GEMINI_API_KEY` in Worker environment
- Set `GOOGLE_CLIENT_ID` in `.env.local` for Drive features

---

## Quality Checkpoint Routing

| Work type | Checkpoint | Owner |
|---|---|---|
| Transcription | Verify model name + chunk handling | Self |
| Drive auth | Verify Client ID reaches `tokenClient` | Self |
| Styling | Confirm no CDN Tailwind in prod build | Self |
| Deploy | Dry-run `wrangler` / Pages build | Self |

---

## Knowledge System

All stores live inside the single hidden folder `.agent-continuity/`.

| Store | Path | Purpose | Consult before | Write after |
|---|---|---|---|---|
| `decisions/` | `.agent-continuity/decisions/` | Hard-to-reverse choices | Cross-cutting decisions | Making a hard choice |
| `learnings/` | `.agent-continuity/learnings/` | Solved problems & lessons | Debugging | Fixing a defect |
| `playbooks/` | `.agent-continuity/playbooks/` | Reusable procedures | Recurring work | Establishing a process |
| `templates/` | `.agent-continuity/templates/` | Reusable starting points | Creating new output | Creating a reusable format |

**Agent-local caveat:** Your session scratch (`.agent-continuity/.local/`) is private. Do
not commit it. Copy from `templates/` into your private space; never move private material
into shared stores.

---

## Folder Visibility Note

All agent-continuity scaffolding lives inside a **single hidden folder**:
`.agent-continuity/`. Hidden on macOS (dot-prefix + `chflags hidden`) so the user's
project root stays clean. Reveal with `chflags nohidden .agent-continuity`.

---

## Reference Files

- `package.json` — Vite + React 19, `@google/genai`, `lucide-react`
- `index.html` — import maps (CDN), gapi/gis scripts
- `vite.config.ts` — `define` injects `API_KEY`/`GEMINI_API_KEY`/`REACT_APP_GOOGLE_CLIENT_ID`
- `functions/proxy.ts` — Cloudflare CORS + Cobalt proxy (v8+ API)
- `wrangler.json` — Cloudflare deploy config (assets `./dist`)
- `.env.example` — Full environment variable documentation

---

## Change Log

| Date | What changed | Agent |
|---|---|---|
| 2026-08-18 | Initial scaffold + shippability assessment | Founding agent |
| 2026-08-28 | Resolved all 4 shippability blockers | Buffy |
| 2026-08-28 | Updated Cobalt integration to v8+ API format | Buffy |
| 2026-08-28 | Improved error handling for link imports | Buffy |
