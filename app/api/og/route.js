// Real imagery for trend evidence: fetch the cited page server-side and
// extract its og:image / twitter:image. This is how feed cards show actual
// pictures of what's trending — the image the source itself chose — without
// scraping galleries or paying for an image API.
// GET /api/og?url=https://... -> { image: string|null }
//
// The URL is user-supplied and we follow redirects, so it's guarded by
// safeFetch (SSRF): only public http(s) hosts, re-checked on every redirect hop.
import { safeFetch } from "@/lib/ssrf";

const cache = new Map(); // url -> { image, at }
const TTL = 1000 * 60 * 60 * 12; // 12h
const TIMEOUT = 6000;

function extract(html) {
  for (const re of [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
  ]) {
    const m = html.match(re);
    if (m && /^https?:\/\//.test(m[1])) return m[1];
  }
  return null;
}

export async function GET(req) {
  const url = new URL(req.url).searchParams.get("url");
  if (!url || !/^https?:\/\//.test(url) || url.includes(".test")) {
    return Response.json({ image: null });
  }
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return Response.json({ image: hit.image });

  let image = null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT);
    const res = await safeFetch(url, {
      signal: ctrl.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        accept: "text/html",
      },
    });
    clearTimeout(t);
    if (res.ok && (res.headers.get("content-type") || "").includes("html")) {
      // Only the head matters; don't pull multi-MB pages.
      const reader = res.body.getReader();
      let html = "", got = 0;
      const dec = new TextDecoder();
      while (got < 200_000) {
        const { done, value } = await reader.read();
        if (done) break;
        html += dec.decode(value, { stream: true });
        got += value.length;
        if (/<\/head>/i.test(html)) break;
      }
      reader.cancel().catch(() => {});
      image = extract(html);
    }
  } catch { /* unreachable page -> null, card falls back */ }

  cache.set(url, { image, at: Date.now() });
  return Response.json({ image });
}
