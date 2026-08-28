// Universal CORS Proxy with Social Media Support
// Supports: YouTube, TikTok, Instagram, Facebook, Twitter/X, Threads, Reddit, Twitch, Vimeo
// Uses Cobalt API (v8+ or v7 fallback) for media extraction
// Rate-limited per caller IP via in-memory sliding window (simple, works in Workers).

// Cobalt instance configuration (set via Worker secrets/env)
// Default: tries official instance, then falls back to community instances.
// For production, deploy your own instance and set COBALT_API_URL + COBALT_API_KEY.
const COBALT_API_URL = "https://api.cobalt.tools";
const COBALT_API_KEY = ""; // Set via Worker secret if using an instance that requires auth

// Fallback community instances (v8+ format: POST /)
// These are public instances that may work if the primary instance is down.
const FALLBACK_INSTANCES = [
  "https://cobalt-api.ayo.tf",
  "https://api.seventyhost.net",
  "https://cobalt.misike.eu",
];

// In-memory store — resets on each Worker restart. For production, use a KV
// rate-limiting policy or move this behind Cloudflare's built-in cache layer.
const rateLimitWindows = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 60s sliding window
const RATE_LIMIT_MAX = 30;            // 30 requests per IP per window

export async function onRequest(context: any) {
  return handleRequest(context.request, context.env);
}

export async function handler(event: any, context: any) {
  const request = {
    url: event.rawUrl || `https://${event.headers.host}${event.path}`,
    method: event.httpMethod,
    headers: event.headers,
    body: event.body
  };
  const response = await handleRequest(request as any, context?.env || {});
  return {
    statusCode: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: await response.text()
  };
}

/** Extract a lightweight caller key from the request headers. */
function callerKey(req: Request): string {
  // Prefer CF-Connecting-IP if present; fall back to a hash of the Host header
  const cfIp = req.headers.get('cf-connecting-ip') ?? '';
  if (cfIp) return 'ip:' + cfIp;
  return 'host:' + (req.headers.get('host') ?? 'unknown');
}

/** Returns true if the caller is within rate limits. */
function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitWindows.get(key);
  if (!entry) {
    rateLimitWindows.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (now > entry.resetAt) {
    rateLimitWindows.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}

function detectPlatform(url: string): string | null {
  const u = url.toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('tiktok.com')) return 'tiktok';
  if (u.includes('instagram.com')) return 'instagram';
  if (u.includes('facebook.com') || u.includes('fb.com') || u.includes('fb.watch')) return 'facebook';
  if (u.includes('twitter.com') || u.includes('x.com')) return 'twitter';
  if (u.includes('threads.net')) return 'threads';
  if (u.includes('reddit.com') || u.includes('redd.it')) return 'reddit';
  if (u.includes('twitch.tv')) return 'twitch';
  if (u.includes('vimeo.com')) return 'vimeo';
  return null;
}

/**
 * Try to extract media URL using Cobalt API v8+ format.
 * POST / with JSON body containing url and options.
 */
async function tryCobaltV8(apiUrl: string, url: string, apiKey: string): Promise<{ url: string; filename?: string } | null> {
  try {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };
    
    if (apiKey) {
      headers['Authorization'] = `Api-Key ${apiKey}`;
    }

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        url,
        videoQuality: '720',
        filenameStyle: 'basic',
        downloadMode: 'auto',
        audioFormat: 'mp3',
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    
    switch (data.status) {
      case 'tunnel':
      case 'redirect':
        return { url: data.url, filename: data.filename };
      case 'picker':
        if (data.picker && data.picker.length > 0) {
          return { url: data.picker[0].url, filename: data.picker[0].filename };
        }
        return null;
      default:
        return null;
    }
  } catch (e) {
    return null;
  }
}

/**
 * Try to extract media URL using Cobalt API v7 format (legacy).
 * POST /api/json with JSON body.
 */
async function tryCobaltV7(apiUrl: string, url: string): Promise<{ url: string; filename?: string } | null> {
  try {
    // Append /api/json if the base URL doesn't already end with it
    const endpoint = apiUrl.endsWith('/api/json') ? apiUrl : `${apiUrl}/api/json`;
    
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        vQuality: '720',
        isAudioOnly: false,
        aFormat: 'mp3',
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    
    if (data.status === 'error' || data.status === 'rate-limit') return null;
    if (data.status === 'redirect' || data.status === 'tunnel' || data.status === 'stream') {
      return { url: data.url, filename: data.filename };
    }
    if (data.status === 'picker' && data.picker?.[0]) {
      return { url: data.picker[0].url, filename: data.picker[0].filename };
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Extract media URL using Cobalt API with automatic version detection.
 * Tries v8+ first, then falls back to v7 format.
 */
async function extractMediaUrl(url: string, env: any): Promise<{ url: string; filename?: string } | null> {
  const apiUrl = env?.COBALT_API_URL || COBALT_API_URL;
  const apiKey = env?.COBALT_API_KEY || COBALT_API_KEY;

  // Try v8+ format first (POST /)
  const v8Result = await tryCobaltV8(apiUrl, url, apiKey);
  if (v8Result) return v8Result;

  // Try v7 format (POST /api/json) for legacy instances
  const v7Result = await tryCobaltV7(apiUrl, url);
  if (v7Result) return v7Result;

  // Try fallback instances (v8+ format)
  for (const fallbackUrl of FALLBACK_INSTANCES) {
    if (fallbackUrl === apiUrl) continue; // Skip if same as primary
    const fallbackResult = await tryCobaltV8(fallbackUrl, url, apiKey);
    if (fallbackResult) return fallbackResult;
  }

  return null;
}

async function handleRequest(request: Request, env: any): Promise<Response> {
  const allowedHeaders = new Set([
    'origin', 'referer', 'user-agent', 'accept',
    'accept-language', 'accept-encoding', 'cache-control'
  ]);

  const isOptions = request.method === 'OPTIONS';
  const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': Array.from(allowedHeaders).join(', '),
    'Access-Control-Max-Age': '86400',
  };

  if (isOptions) {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // --- Rate limit ---
  const key = callerKey(request);
  if (!checkRateLimit(key)) {
    return new Response(JSON.stringify({ error: 'Rate limited', limit: RATE_LIMIT_MAX }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', ...corsHeaders, 'Retry-After': '60' }
    });
  }

  try {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');
    if (!targetUrl) {
      return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    let parsedUrl;
    try { parsedUrl = new URL(targetUrl); } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid URL' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Only allow http/https targets
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return new Response(JSON.stringify({ error: 'Only http/https URLs allowed' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const platform = detectPlatform(targetUrl);
    let finalUrl = targetUrl;
    let filename: string | undefined;

    // Use Cobalt for social media platforms
    if (platform) {
      const extracted = await extractMediaUrl(targetUrl, env);
      if (extracted) {
        finalUrl = extracted.url;
        filename = extracted.filename;
      } else {
        return new Response(JSON.stringify({
          error: 'Failed to extract media',
          message: `Could not extract media from ${platform}. Content may be private, unavailable, or no working Cobalt instance was found.`,
          platform,
          hint: 'Try deploying your own Cobalt instance (https://github.com/imputnet/cobalt) and set COBALT_API_URL in your Worker environment.'
        }), {
          status: 422,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // Fetch with timeout + bounded body size
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000); // 60s timeout

    const response = await fetch(finalUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'ScribeProxy/1.0', 'Accept': '*/*' }
    });
    clearTimeout(timeoutId);

    const contentType = response.headers.get('Content-Type') || '';
    const bodyBuffer = await response.arrayBuffer();

    // Hard size limit: 500MB cap (pragmatic for transcription workloads)
    const MAX_SIZE_BYTES = 500 * 1024 * 1024;
    if (bodyBuffer.byteLength > MAX_SIZE_BYTES) {
      return new Response(JSON.stringify({
        error: 'Media too large',
        size: bodyBuffer.byteLength,
        limit: MAX_SIZE_BYTES,
        platform
      }), {
        status: 413,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Build response headers
    const responseHeaders: Record<string, string> = {
      'Content-Type': contentType || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Cache-Control': 'public, max-age=3600',
      'X-Platform': platform || 'direct',
      'X-Content-Length': String(bodyBuffer.byteLength),
    };

    // Add filename header if available from Cobalt
    if (filename) {
      responseHeaders['X-Content-Disposition'] = `attachment; filename="${filename}"`;
    }

    return new Response(bodyBuffer, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    const message = error?.name === 'AbortError' 
      ? 'Request timed out. The file may be too large or the server is slow.'
      : error?.message || 'Unknown error';
    
    return new Response(JSON.stringify({
      error: 'Failed to fetch',
      message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}

export default async function(req: any, res: any) {
  const url = `https://${req.headers.host}${req.url}`;
  const request = new Request(url, {
    method: req.method,
    headers: req.headers,
    body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined
  });
  const response = await handleRequest(request, {});
  res.status(response.status);
  response.headers.forEach((value: any, key: any) => res.setHeader(key, value));
  res.send(await response.arrayBuffer());
}
