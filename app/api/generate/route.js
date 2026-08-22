// Real image generation for the Design Studio — multi-provider.
//
// POST { prompts: string[], reference_image_urls?: string[] }
//   -> { images: (dataUrl|null)[], provider, error }
// one image per prompt, null where generation failed so the client can fall
// back to the SVG preview per-slot. 503 when no key is configured.
//
// Two bugs this route previously had, both fixed here:
//   1. It accepted ATELIER_OPENAI_API_KEY as a valid key but ALWAYS called
//      Google's Gemini endpoint — so a machine with only the OpenAI key sent
//      that key to Google and every generation failed. Now the provider is
//      chosen from whichever key is present, and we call THAT provider.
//   2. Reference images (garment/swatch/fit) were never sent, so fallback
//      generation silently ignored the references the UI promises fidelity to.
//      Now reference_image_urls are forwarded to whichever provider is used.
//
// Reference URLs are user-supplied and fetched server-side, so every reference
// fetch goes through safeFetch (SSRF guard) — an unsafe/private URL is skipped,
// never used to reach the internal network.
import { safeFetch } from "@/lib/ssrf";

const GOOGLE_KEY = process.env.GOOGLE_AI_API_KEY;
const OPENAI_KEY = process.env.ATELIER_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
const GEMINI_MODEL = process.env.ATELIER_IMAGE_MODEL || "gemini-2.5-flash-image";
const OPENAI_MODEL = process.env.ATELIER_OPENAI_IMAGE_MODEL || "gpt-image-1";
const OPENAI_BASE = (process.env.ATELIER_OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
const MAX_IMAGES = 4;
const MAX_REFS = 3;

// Fetch a reference image URL into the base64 inline form Gemini expects.
async function fetchInline(url) {
  const r = await safeFetch(url);
  if (!r.ok) return null;
  const mimeType = r.headers.get("content-type") || "image/jpeg";
  const data = Buffer.from(await r.arrayBuffer()).toString("base64");
  return { mimeType, data };
}

// --- Google (Gemini image model): text + inline reference parts -------------
async function genGemini(prompt, refs) {
  const parts = [{ text: String(prompt) }];
  for (const url of refs.slice(0, MAX_REFS)) {
    const inline = await fetchInline(url).catch(() => null);
    if (inline) parts.push({ inlineData: inline }); // condition on the real reference
  }
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GOOGLE_KEY}`,
    { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }] }) });
  if (!r.ok) return { image: null, error: `${r.status}` };
  const j = await r.json();
  const part = j.candidates?.[0]?.content?.parts?.find((pt) => pt.inlineData?.data);
  return { image: part ? `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}` : null, error: null };
}

// --- OpenAI images: generations (text) or edits (with references) -----------
function pickOpenAIImage(j) {
  const d = j.data?.[0];
  if (!d) return null;
  return d.b64_json ? `data:image/png;base64,${d.b64_json}` : (d.url || null);
}

async function genOpenAIText(prompt) {
  const r = await fetch(`${OPENAI_BASE}/images/generations`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({ model: OPENAI_MODEL, prompt: String(prompt), n: 1 }),
  });
  if (!r.ok) return { image: null, error: `${r.status}` };
  return { image: pickOpenAIImage(await r.json()), error: null };
}

async function genOpenAI(prompt, refs) {
  if (!refs.length) return genOpenAIText(prompt);
  // References present: use the edits endpoint so they actually condition output.
  const form = new FormData();
  form.append("model", OPENAI_MODEL);
  form.append("prompt", String(prompt));
  form.append("n", "1");
  let attached = 0;
  for (const url of refs.slice(0, MAX_REFS)) {
    try {
      const rf = await safeFetch(url);
      if (!rf.ok) continue;
      form.append("image[]", await rf.blob(), `ref${attached}.png`);
      attached++;
    } catch { /* skip an unreachable or unsafe reference rather than fail the call */ }
  }
  if (!attached) return genOpenAIText(prompt); // every ref failed: honest text-only
  const r = await fetch(`${OPENAI_BASE}/images/edits`, {
    method: "POST", headers: { authorization: `Bearer ${OPENAI_KEY}` }, body: form });
  if (!r.ok) return { image: null, error: `${r.status}` };
  return { image: pickOpenAIImage(await r.json()), error: null };
}

// Readiness for THIS fallback path, mirroring the engine's /studio/readiness.
//
// The studio tries the engine first and silently falls through to here, so a
// header describing only the engine describes the wrong provider whenever the
// engine has no key and this route does. Note the selection order is the
// INVERSE of the engine's — Google first here, OpenAI first there — so the two
// paths genuinely disagree about who serves, and the header has to say which.
//
// ⚠ No prices. The engine states cost because it owns that table; duplicating
// it here is how one number becomes two that drift. An unknown price is null,
// which is what the browser should have been recording all along.
export async function GET() {
  const provider = GOOGLE_KEY ? "google" : OPENAI_KEY ? "openai" : null;
  if (!provider) {
    return Response.json({
      configured: false, provider: null, model: null,
      supports_references: false, max_references: 0,
      cost_known: false, unavailable_reason: "no_key",
    });
  }
  return Response.json({
    configured: true,
    provider,
    model: provider === "google" ? GEMINI_MODEL : OPENAI_MODEL,
    supports_references: true,
    max_references: MAX_REFS,
    cost_known: false,
    unavailable_reason: null,
  });
}

export async function POST(req) {
  const provider = GOOGLE_KEY ? "google" : OPENAI_KEY ? "openai" : null;
  if (!provider) {
    return Response.json({ error: "no image API key configured" }, { status: 503 });
  }
  const body = await req.json().catch(() => ({}));
  const { prompts } = body;
  const refs = Array.isArray(body.reference_image_urls)
    ? body.reference_image_urls.filter(Boolean) : [];
  if (!Array.isArray(prompts) || prompts.length === 0) {
    return Response.json({ error: "prompts[] required" }, { status: 400 });
  }

  const images = [];
  let lastError = null;
  for (const p of prompts.slice(0, MAX_IMAGES)) {
    try {
      const { image, error } = provider === "google"
        ? await genGemini(p, refs)
        : await genOpenAI(p, refs);
      if (error) lastError = error;
      images.push(image);
    } catch (e) {
      lastError = String(e?.message || e);
      images.push(null);
    }
  }
  return Response.json({ images, provider, error: images.every((i) => !i) ? lastError : null });
}
