// One authentication path for every engine request. Production middleware
// protects /brands/{id}; a token that only Studio sends makes the rest of the
// product fail as soon as production mode is enabled.
export const TOKEN_KEY = "atelier-token";

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || null; } catch { return null; }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* storage blocked */ }
}

export function authHeaders(extra = {}) {
  const token = getToken();
  return {
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

export function engineFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: authHeaders(options.headers || {}),
  });
}


// Same-origin call to the Next app's OWN /api routes.
//
// ⚠ I GUARDED THOSE ROUTES AND LEFT THEIR CALLERS UNCHANGED (owner review,
// 2026-08-12), which in production means every one of them 401s. Guarding an
// endpoint and not updating its callers is not a security fix, it is an outage
// with a security-shaped commit message.
//
// `engineFetch` is for the ENGINE's absolute URLs; this is for our own relative
// ones. Same token, same header, different base — kept separate so a reader can
// tell at the call site which server is being addressed.
export function appFetch(path, options = {}) {
  return fetch(path, {
    ...options,
    headers: authHeaders(options.headers || {}),
  });
}
