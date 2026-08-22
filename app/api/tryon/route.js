// Real virtual try-on via the FASHN API (docs.fashn.ai): a garment image +
// a photo of a real person → that person wearing the garment.
//
// Honesty rules:
//   · No FASHN_API_KEY → 503 {error:"no_key"} — the client falls back to the
//     generation-based visualization and LABELS it as generated. We never
//     pass off a generation as a real try-on.
//   · Cost is documented: tryon-max at fast/1k = 1 credit per image.
//   · Images travel as base64 data URIs — the engine's /static URLs are
//     localhost-only and FASHN's servers can't fetch them.
// Alta × Public School ships a partner-only "Style with Alta" link-out (no
// public API, TechCrunch 2026-02) — when partner access exists, it plugs in
// beside FASHN as a second real provider.
const FASHN_BASE = "https://api.fashn.ai/v1";
const POLL_MS = 2500;
const DEADLINE_MS = 90_000;

const json = (body, status = 200) => Response.json(body, { status });

export async function POST(req) {
  const key = process.env.FASHN_API_KEY;
  if (!key) return json({ error: "no_key" }, 503);

  let body;
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  const { garment_image, model_image, resolution = "1k" } = body || {};
  if (!garment_image || !model_image) return json({ error: "garment_image and model_image required" }, 400);

  const headers = { authorization: `Bearer ${key}`, "content-type": "application/json" };
  const run = await fetch(`${FASHN_BASE}/run`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model_name: "tryon-max",
      inputs: {
        product_image: garment_image,
        model_image,
        resolution,
        generation_mode: "fast", // 1 credit at 1k — draft economics, same policy as the studio
        num_images: 1,
        output_format: "jpeg",
      },
    }),
  });
  const rd = await run.json().catch(() => null);
  if (run.status === 429) return json({ error: "quota" }, 429);
  if (!run.ok || !rd?.id) return json({ error: rd?.error || `fashn ${run.status}` }, 502);

  const deadline = Date.now() + DEADLINE_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const st = await fetch(`${FASHN_BASE}/status/${rd.id}`, { headers });
    const sd = await st.json().catch(() => null);
    if (sd?.status === "completed" && sd.output?.[0]) return json({ url: sd.output[0], provider: "fashn" });
    if (sd?.status === "failed") return json({ error: sd?.error || "fashn failed" }, 502);
  }
  return json({ error: "fashn timeout" }, 504);
}
