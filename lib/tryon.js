import { appFetch } from "@/lib/auth";
// Try-on providers for Concept Studio — a concept image + a REAL person's
// photo, with the result always labeled by what it actually is:
//   · fashn      — real virtual try-on (FASHN API, server route /api/tryon).
//   · generation — image-model visualization conditioned on both photos;
//                  labeled "visualización generada", never sold as a fit.
// Alta (the Public School partner) has no public API — documented in the
// route; it slots in here as a third provider when partner access exists.

// FASHN can't fetch localhost/engine URLs, so anything non-public travels
// as a base64 data URI.
export async function toDataUri(url) {
  if (!url || url.startsWith("data:")) return url;
  const blob = await fetch(url).then((r) => r.blob());
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error("No pude leer la imagen"));
    fr.readAsDataURL(blob);
  });
}

async function fashnTryOn({ garmentUrl, personaImage }) {
  const res = await appFetch("/api/tryon", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      garment_image: await toDataUri(garmentUrl),
      model_image: await toDataUri(personaImage),
      resolution: "1k",
    }),
  });
  const d = await res.json().catch(() => null);
  if (res.status === 503 && d?.error === "no_key") { const e = new Error("no_key"); e.code = "no_key"; throw e; }
  if (res.status === 429 || d?.error === "quota") throw new Error("Sin cupo de try-on — probá en unos minutos.");
  if (!res.ok || !d?.url) throw new Error(d?.error || "El try-on falló");
  return { url: d.url, provider: "fashn", label: "try-on real · FASHN" };
}

const GEN_PROMPT = (personaName) =>
  `La MISMA prenda de la primera imagen de referencia, puesta por LA MISMA persona de la segunda imagen de referencia${personaName ? ` (${personaName})` : ""}. ` +
  "Foto editorial de e-commerce de cuerpo entero, fondo neutro claro, luz suave. Mantené fiel el diseño, color y textura de la prenda, y la fisonomía real de la persona. Sin texto ni marca de agua.";

// Try FASHN first; without a key fall back to generation and SAY SO via the
// returned label. `callGenerate(prompt, refs)` is the studio's existing
// engine-first generation helper.
export async function runTryOn({ garmentUrl, persona, callGenerate }) {
  try {
    return await fashnTryOn({ garmentUrl, personaImage: persona.image });
  } catch (e) {
    if (e.code !== "no_key") throw e;
    const url = await callGenerate(GEN_PROMPT(persona.name), [garmentUrl, persona.image]);
    return { url, provider: "generation", label: "visualización generada" };
  }
}
