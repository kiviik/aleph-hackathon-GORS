// The Next app has its own API surface, and the engine's gate cannot see it.
//
// ⚠ THREE ROUTES SPENT MONEY FOR ANYONE WHO COULD REACH THE PAGE (second owner
// security review, 2026-08-12):
//
//   POST /api/generate   OpenAI / Gemini image generation, on the server's key
//   POST /api/tryon      FASHN jobs, on the server's key
//   GET  /api/og         server-side fetch of a caller-supplied URL
//
// The engine's 192-route policy table knows nothing about these — they are not
// engine routes. Hardening FastAPI and calling the platform closed was wrong
// for exactly that reason: there are two servers, and only one of them had a
// boundary. `route_policy.py` is the engine's boundary; this file is the app's.
//
// POSTURE MIRRORS THE ENGINE ON PURPOSE. `enforce_production_path` is a no-op
// in demo mode so the keyless pilot loop keeps working, and this does the same:
// demo passes, production requires a token the ENGINE recognises. Diverging
// would mean two different answers to "am I allowed", which is how the first
// hole happened.
//
// ⚠ WHAT THIS IS NOT. It is authentication, not a quota. A signed-in tenant can
// still spend provider budget in a loop. Rate limiting and per-brand spend caps
// are tracked in SECURITY-2026-08-12.md and are not solved here.

const API_BASE = process.env.NEXT_PUBLIC_ATELIER_API || "http://127.0.0.1:8000";

// Routes that cost money or reach the network on the caller's behalf.
const GUARDED = ["/api/generate", "/api/tryon", "/api/og"];

// `/healthz` is public and cheap, but not free — cache the mode briefly so a
// burst of generations does not become a burst of health checks.
let modeCache = { value: null, at: 0 };
const MODE_TTL_MS = 30_000;

async function engineMode(now) {
  if (modeCache.value && now - modeCache.at < MODE_TTL_MS) return modeCache.value;
  try {
    const res = await fetch(`${API_BASE}/healthz`, { cache: "no-store" });
    if (!res.ok) return "unknown";                 // a 5xx is not a licence
    const body = await res.json();
    const mode = String(body?.mode || "").toLowerCase();
    modeCache = { value: mode || "unknown", at: now };
    return modeCache.value;
  } catch {
    // An unreachable or unparseable engine is not a state in which paid
    // generation should proceed.
    return "unknown";
  }
}

async function callerIsAuthenticated(authorization) {
  if (!authorization) return false;
  try {
    const res = await fetch(`${API_BASE}/me`, {
      headers: { authorization },
      cache: "no-store",
    });
    if (!res.ok) return false;
    const me = await res.json();
    return Boolean(me?.authenticated);
  } catch {
    return false;
  }
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  if (!GUARDED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return;
  }

  // ⚠ THIS WAS `if (mode !== "production") return` AND THAT FAILED OPEN
  // (owner review, 2026-08-12). Everything that was not the literal string
  // "production" was waved through: `demo`, `unknown`, a 200 with no `mode`
  // field, a 5xx, an unparseable body. A public demo deployment configured with
  // real provider keys — which is exactly what a demo deployment is — stayed
  // wide open, and so did any environment whose health check hiccuped.
  //
  // Inverted: DEMO is the only exemption, and it must be stated affirmatively.
  // Everything else, known or not, needs a token.
  const mode = await engineMode(Date.now());
  if (mode === "demo") return;            // the keyless pilot loop, as the engine

  const ok = await callerIsAuthenticated(request.headers.get("authorization"));
  if (ok) return;

  return new Response(
    JSON.stringify({ error: "authentication required" }),
    { status: 401, headers: { "content-type": "application/json" } });
}

export const config = { matcher: ["/api/generate", "/api/tryon", "/api/og"] };
