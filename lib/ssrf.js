// SERVER-ONLY SSRF guard. Import only from API route handlers (never a client
// component — it pulls in node:dns/node:net).
//
// Routes that fetch a user-supplied URL server-side (/api/og follows redirects
// to read og:image; /api/generate fetches reference images) can be tricked into
// hitting localhost, private networks, or cloud metadata (169.254.169.254).
// This blocks that: only http(s), no embedded credentials, and the host must
// resolve to a PUBLIC address — then redirects are followed MANUALLY with the
// same check on every hop, so a public URL can't 302 into the internal network.
//
// Residual risk: DNS rebinding between our lookup and fetch's own lookup.
// Closing it fully needs IP-pinned connects; this covers direct-private and
// redirect-to-private, the practical vectors.
import dns from "node:dns/promises";
import net from "node:net";

function ipv4Private(ip) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true;          // this-net, private, loopback
  if (a === 169 && b === 254) return true;                    // link-local + 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true;           // 172.16/12
  if (a === 192 && b === 168) return true;                    // 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true;          // CGNAT 100.64/10
  if (a === 192 && b === 0) return true;                      // 192.0.0/24, 192.0.2/24
  if (a === 198 && (b === 18 || b === 19)) return true;       // benchmarking 198.18/15
  if (a >= 224) return true;                                  // multicast/reserved + 255.255.255.255
  return false;
}

function ipv6Private(ip) {
  const s = ip.toLowerCase();
  if (s === "::1" || s === "::") return true;                 // loopback / unspecified
  if (/^fe[89ab]/.test(s)) return true;                       // fe80::/10 link-local
  if (/^f[cd]/.test(s)) return true;                          // fc00::/7 unique-local
  const m = s.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);          // IPv4-mapped
  if (m) return ipv4Private(m[1]);
  return false;
}

export function isPrivateAddr(ip) {
  const fam = net.isIP(ip);
  if (fam === 4) return ipv4Private(ip);
  if (fam === 6) return ipv6Private(ip);
  return true; // not a parseable IP -> treat as unsafe
}

async function assertHostPublic(hostname) {
  const host = hostname.replace(/^\[|\]$/g, ""); // IPv6 URL hostnames carry [brackets]
  if (net.isIP(host)) {
    if (isPrivateAddr(host)) throw new Error("blocked address");
    return;
  }
  const lc = host.toLowerCase();
  if (lc === "localhost" || lc.endsWith(".localhost") || lc.endsWith(".local") ||
      lc.endsWith(".internal") || lc === "metadata.google.internal") {
    throw new Error("blocked host");
  }
  let addrs;
  try { addrs = await dns.lookup(host, { all: true }); }
  catch { throw new Error("dns failed"); }
  if (!addrs.length || addrs.some((a) => isPrivateAddr(a.address))) throw new Error("blocked address");
}

export async function assertSafeUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new Error("bad url"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("blocked protocol");
  if (u.username || u.password) throw new Error("credentials in url");
  await assertHostPublic(u.hostname);
  return u;
}

// Drop-in fetch that validates the target (and every redirect hop) is public.
export async function safeFetch(raw, init = {}, { maxRedirects = 4 } = {}) {
  let url = raw;
  for (let i = 0; i <= maxRedirects; i++) {
    await assertSafeUrl(url);
    const res = await fetch(url, { ...init, redirect: "manual" });
    const loc = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!loc) return res;
    url = new URL(loc, url).toString(); // re-validated at the top of the next loop
  }
  throw new Error("too many redirects");
}
