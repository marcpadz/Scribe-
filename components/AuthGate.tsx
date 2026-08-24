import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, Loader2, CheckCircle2, XCircle, ArrowRight, RefreshCw } from 'lucide-react';

/**
 * Auth gate using direct token-based auth (no cookies).
 *
 * Why: The SPA is served from GitHub Pages (different origin than the auth
 * Worker), so browser SameSite cookie policy blocks Better Auth's default
 * cookie-based sessions. We use Bearer tokens stored in localStorage instead.
 *
 * Flow:
 *  1. Sign up → account created, verification email sent, user redirected to verify screen
 *  2. Verify screen → user clicks link in email, then returns and signs in
 *  3. Sign in → server validates credentials, returns session token, stored in localStorage
 *  4. Subsequent requests include Authorization: Bearer <token>
 */
const AUTH_BASE = import.meta.env.VITE_AUTH_URL || 'http://localhost:8787';
const TOKEN_KEY = 'neoscriber_auth_token';
const USER_KEY = 'neoscriber_auth_user';

function saveToken(token: string, user: any) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
function getUser(): any {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

type Mode = 'signin' | 'signup' | 'verify';

const AuthGate: React.FC<{ onAuthed: () => void }> = ({ onAuthed }) => {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);

  const validate = (): string | null => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'Enter a valid email address.';
    if (password.length < 8) return 'Password must be at least 8 characters.';
    return null;
  };

  const apiFetch = async (path: string, body?: any, token?: string | null): Promise<any> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${AUTH_BASE}${path}`, {
      method: 'POST',
      headers,
      credentials: 'omit', // no cookies needed — we use Bearer tokens
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.error || `Request failed (${res.status})`);
    }
    return data;
  };

  const handleSignup = async () => {
    setError(null);
    setSuccess(null);
    const v = validate();
    if (v) { setError(v); return; }
    setLoading(true);
    try {
      const data = await apiFetch('/api/auth/token/sign-up', { email, password });
      setSuccess(`Account created! Check ${email} for a verification link.`);
      setMode('verify');
    } catch (err: any) {
      setError(err?.message || 'Sign-up failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async () => {
    setError(null);
    setSuccess(null);
    const v = validate();
    if (v) { setError(v); return; }
    setLoading(true);
    try {
      const data = await apiFetch('/api/auth/token/sign-in', { email, password });
      if (data.needsVerification) {
        setSuccess('Account created! Check your email to verify before signing in fully.');
        setMode('verify');
        return;
      }
      // Signed in successfully — store the token
      saveToken(data.token!, data.user);
      setSuccess('Signed in!');
      onAuthed();
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('not verified')) {
        setSuccess('Email not verified yet. Check your inbox — if you can\'t find it, click "Resend" below.');
        setMode('verify');
      } else {
        setError(msg || 'Sign-in failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setLoading(true);
    try {
      await apiFetch('/api/auth/token/resend-verification', { email });
      setSuccess('Verification email resent! Check your inbox.');
    } catch (err: any) {
      setError(err?.message || 'Failed to resend.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-gradient-to-br from-[#0b0f19] via-[#121a2e] to-[#0b0f19] text-white">
      {/* animated orbs */}
      <div className="absolute top-[-15%] left-[-10%] w-[45%] h-[45%] bg-[#4ECDC4] opacity-20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-[-15%] right-[-10%] w-[45%] h-[45%] bg-[#FFE900] opacity-10 rounded-full blur-3xl animate-pulse" />

      <div className="relative z-10 w-full max-w-md">
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-black uppercase tracking-tighter">
              Neo<span className="text-[#FFE900]">Scriber</span>
            </h1>
            <p className="text-sm text-white/60 mt-1">
              {mode === 'signup' ? 'Create your account' : mode === 'verify' ? 'Verify your email' : 'Welcome back'}
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
              <XCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-300 text-sm">
              <CheckCircle2 className="w-4 h-4 shrink-0" /> {success}
            </div>
          )}

          {mode !== 'verify' ? (
            <form onSubmit={(e) => { e.preventDefault(); mode === 'signup' ? handleSignup() : handleSignIn(); }} className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-3 py-3 rounded-lg bg-white/5 border border-white/10 focus:border-[#FFE900] outline-none"
                  required
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password (8+ chars)"
                  className="w-full pl-10 pr-10 py-3 rounded-lg bg-white/5 border border-white/10 focus:border-[#FFE900] outline-none"
                  required
                />
                <button type="button" onClick={() => setShowPw(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-lg bg-[#FFE900] text-black font-bold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-60"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                {mode === 'signup' ? 'Sign Up' : 'Sign In'}
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <p className="text-center text-white/70 text-sm py-2">
                We sent a verification link to <b className="text-white">{email}</b>.
                Click the link in your email to activate your account, then sign in.
              </p>
              <button
                onClick={handleResend}
                disabled={loading}
                className="w-full py-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-center gap-2 font-medium disabled:opacity-60"
              >
                <RefreshCw className="w-4 h-4" /> Resend verification email
              </button>
            </div>
          )}

          {mode !== 'verify' && (
            <p className="text-center text-sm text-white/60 mt-6">
              {mode === 'signin' ? (
                <>New here? <button onClick={() => { setMode('signup'); setError(null); }} className="text-[#FFE900] font-semibold">Create an account</button></>
              ) : (
                <>Have an account? <button onClick={() => { setMode('signin'); setError(null); }} className="text-[#FFE900] font-semibold">Sign in</button></>
              )}
            </p>
          )}

          <p className="text-[10px] text-center text-white/40 mt-6 leading-tight">
            Free accounts can transcribe up to 2 minutes. Verified accounts unlock full features.
          </p>
        </div>
      </div>
    </div>
  );
};

export { getToken, getUser, clearToken };
export default AuthGate;
