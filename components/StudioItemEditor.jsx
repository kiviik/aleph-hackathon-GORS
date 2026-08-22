"use client";
// The per-item workspace (owner mockup, 2026-07-21): one garment, full screen.
// Left: the commercial spec — category, internal code, main fabric WITH ITS
// REAL SWATCH PHOTO, composition/weight/origin (team-entered fields; dashes
// until the team fills them, never invented). Center: the canvas with its
// views (frente / detalle / en modelo) and proposed colours. Right: "Crear
// con IA" — a scoped edit panel: the alcance chips shape the prompt, the
// reference is always the base product (the endpoint takes ONE reference —
// said in the UI), fidelity + variant count + visible cost. Bottom: the
// version filmstrip with an Original/Vn compare toggle, and the decision box
// where nothing ships without the designer's rating.
import { useEffect, useMemo, useState } from "react";
import { ownRefsFromDna, scoreVariation } from "@/lib/differentiation";
import { colName } from "@/lib/signals";
import { runTryOn, toDataUri } from "@/lib/tryon";
import { compactImage } from "@/lib/explore";
import { dnaPromptBlock } from "@/lib/brandDna";
import { makeVersion, versionAlt } from "@/lib/version";
import { approvalLabel } from "@/lib/team";
import { useEngine } from "@/components/EngineProvider";
import { useTeam } from "@/components/IdentityProvider";
import { readScoped, writeScoped } from "@/lib/brandStore";
import {
  GUIDANCE_LABEL, buildIntent, locksFromScopes,
} from "@/lib/generationIntent.mjs";
import GenerationReceipt from "@/components/GenerationReceipt";

const BAND_ES = {
  open: "diferenciado de tu línea y del cono de tendencias",
  adjacent: "emparentado con lo existente, con ángulo propio",
  crowded: "cerca de lo que ya existe o de lo que todos persiguen",
};
const OWNER_ES = { "your catalog": "tu catálogo", "market trend": "tendencia de mercado" };

const SCOPES = [["silueta", "Silueta"], ["detalle", "Detalle"], ["tela", "Tela"],
  ["color", "Color"], ["estampa", "Estampa"]];

const fmtTs = (iso) => {
  const d = new Date(iso); if (isNaN(d)) return "";
  const p = (x) => String(x).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

// Real people for try-on: photos the team uploads WITH the person's consent
// (said in the UI). Few and small, so localStorage with the quota-safe guard.
const PERSONAS_KEY = "atelier-personas-v1";
const loadPersonas = (brandId) => readScoped(PERSONAS_KEY, brandId, []) || [];
const savePersonas = (list, brandId) => {
  { const r = writeScoped(PERSONAS_KEY, brandId, list); if (r.ok) return true; }
  try { return false; }
  catch { return false; }
};

export default function StudioItemEditor({
  item, coll, itemIndex, fabric, palette, trends, dna, quality, cost,
  abs, patchItem, callGenerate, approve, exportPng, onClose, onCommit, flash,
}) {
  // CONTEXT FIRST, ALWAYS. These three sat at line ~125, below code that used
  // them, so opening any product workspace threw
  // `ReferenceError: Cannot access 'personaBrandId' before initialization` and
  // the whole creative half of the product — AI editing, variants, model
  // shots, try-on, review prep, product approval — was unreachable (owner,
  // 2026-07-25). `const` is not hoisted like `var`: the effect on line ~68
  // evaluates its dependency array during render, which is inside the temporal
  // dead zone of a `const` declared later in the same body.
  //
  // It reached production because nothing mounts this component in a test —
  // 59/59 passed with the crash in place. tests/studioItemEditor.test.mjs now
  // asserts the ordering directly (see its header for why it is a source
  // check rather than a mount).
  const team = useTeam();
  const engineCtx = useEngine();
  // useBrandId's rule, not the run-gate: personas are brand-scoped BROWSER
  // state that exists whether or not the brand has ever run a market pass.
  // With the old `status === "live" ? brandId : null` idiom, every brand
  // without a run shared one unscoped persona bucket.
  const personaBrandId = engineCtx.connected ? engineCtx.brandId : null;

  const [tab, setTab] = useState("ia");
  const [prompt, setPrompt] = useState("");
  const [scopes, setScopes] = useState(["detalle"]);
  const [fidelity, setFidelity] = useState("alta");
  const [nVars, setNVars] = useState(2);
  // The last generation's receipt: her words, the app's context, and the
  // ENGINE's control mapping — rendered by GenerationReceipt so the panel can
  // answer "qué se envió" with the compiler's record, never a local claim.
  const [lastSent, setLastSent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState("frente"); // frente | detalle | modelo
  const [compare, setCompare] = useState(false);
  const [err, setErr] = useState("");
  const [personas, setPersonas] = useState([]);
  const [addingPersona, setAddingPersona] = useState(false);
  const [personaName, setPersonaName] = useState("");
  const [tryingId, setTryingId] = useState(null);

  useEffect(() => { setPersonas(loadPersonas(personaBrandId)); }, [personaBrandId]);

  async function addPersona(file) {
    if (!file || !personaName.trim()) return;
    try {
      const raw = await toDataUri(URL.createObjectURL(file));
      const image = await compactImage(raw, 1000, 0.85);
      const next = [{ id: `${Date.now().toString(36)}`, name: personaName.trim(), image, consent: true }, ...personas];
      if (!savePersonas(next, personaBrandId)) { flash("Sin espacio para más fotos — borrá alguna persona"); return; }
      setPersonas(next);
      setPersonaName(""); setAddingPersona(false);
      flash(`${next[0].name} en tus personas de prueba`);
    } catch { flash("No pude leer la foto"); }
  }
  function removePersona(id) {
    const next = personas.filter((p) => p.id !== id);
    savePersonas(next, personaBrandId); setPersonas(next);
  }

  // Every generated version is one auditable shape (shared makeVersion), with
  // this concept's owner as creator and the active quality/cost.
  const ver = (kind, url, note, meta = {}) =>
    makeVersion(kind, url, note, { ...meta, quality, costCents: cost,
      byId: item.ownerId, byName: team.byId(item.ownerId)?.name });

  // Try the concept on a real person. FASHN (real try-on) when the key is
  // configured; otherwise generation, and the record SAYS which one it was.
  async function tryOnPersona(persona) {
    if (!item.cover || busy || tryingId) return;
    setTryingId(persona.id); setErr("");
    try {
      const r = await runTryOn({ garmentUrl: abs(item.cover), persona, callGenerate });
      let stored = r.url;
      if (r.provider === "fashn") {
        // FASHN output URLs are CDN-hosted and can expire — persist a compact copy.
        try { stored = await compactImage(await toDataUri(r.url), 1200, 0.85); } catch { /* keep URL */ }
      } else if (stored.startsWith("data:")) {
        stored = await compactImage(stored, 1200, 0.85);
      }
      const rec = ver("modelo", stored, `${r.label} · ${persona.name}`, { provider: r.provider, references: [abs(item.cover)] });
      patchItem(item.id, { modelShot: stored, images: [rec, ...item.images] });
      setView("modelo");
      flash(r.provider === "fashn"
        ? `Try-on real sobre ${persona.name} (FASHN)`
        : `Visualización generada sobre ${persona.name} — no es un try-on real (falta FASHN_API_KEY)`);
    } catch (e) { setErr(e.message); flash(e.message); }
    setTryingId(null);
  }

  const code = `CP-${(coll.name || "COL").replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase()}-${String(itemIndex + 1).padStart(2, "0")}`;
  // ownRefs come from the ACTIVE brand's DNA — never a hardcoded catalog.
  const ownRefs = useMemo(() => ownRefsFromDna(dna), [dna]);
  const dif = useMemo(() => scoreVariation(
    { color: item.colorway, texture: fabric?.name || "Cotton jersey" },
    { trends, ownRefs },
  ), [item.colorway, fabric, trends, ownRefs]);
  const owner = team.byId(item.ownerId);
  const approver = team.byId(item.approverId);
  const workflowStatus = item.approved ? "approved" : (item.approvalStatus || (item.cover ? "in_progress" : "draft"));
  const availableApprovers = team.approvers.filter((person) => person.id !== item.ownerId);
  const readyForReview = Boolean(item.cover && item.rating && item.ownerId && item.approverId && item.ownerId !== item.approverId && item.dueAt);

  function changeOwner(ownerId) {
    const patch = { ownerId };
    if (ownerId === item.approverId) patch.approverId = team.approvers.find((person) => person.id !== ownerId)?.id || "";
    patchItem(item.id, patch);
  }

  function submitForReview() {
    if (!readyForReview) {
      flash("Completá responsable, aprobador, fecha, base y ajuste de marca");
      return;
    }
    patchItem(item.id, { approvalStatus: "in_review", reviewRequestedAt: new Date().toISOString() });
    flash(`Enviada a revisión de ${approver?.name || "la persona aprobadora"}`);
  }

  const concepts = item.images.filter((v) => v.kind === "concepto");
  const original = concepts[concepts.length - 1]; // first ever concept
  const shown = compare && original ? original.url
    : view === "modelo" && item.modelShot ? item.modelShot
    : view === "detalle" && item.detailShot ? item.detailShot
    : item.cover;

  const toggleScope = (s) =>
    setScopes((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]));

  // ⚠ FALLBACK RENDERING ONLY. On the main path the SERVER composes the
  // prompt from the typed intent below (2026-08-17 reversal); this local
  // concatenation survives solely for the no-engine `/api/generate` fallback,
  // which takes one plain string.
  function editPrompt() {
    const sc = scopes.length ? `Cambiá SOLO: ${scopes.map((s) => SCOPES.find(([k]) => k === s)?.[1] || s).join(", ").toLowerCase()}.` : "";
    const fid = editContext();
    const fab = scopes.includes("tela") && fabric
      ? ` La tela objetivo es ${fabric.name}${fabric.comp ? ` (${fabric.comp})` : ""}.` : "";
    return `Partiendo de la prenda de la imagen de referencia: ${prompt.trim()}. ${sc} ${fid}${fab} Sin texto ni marca de agua.`;
  }

  // What the app adds around her words for an edit — fidelity staging. It is
  // GUIDANCE, compiled into the prompt by the server and labelled so in the
  // mapping; the UI says "guía de prompt" wherever this travels.
  function editContext() {
    return (fidelity === "alta"
      ? "Cambios mínimos: máxima fidelidad a la prenda original — misma prenda, mismo encuadre, mismo fondo neutro de e-commerce."
      : "Podés reinterpretar la prenda manteniendo su identidad reconocible; encuadre e-commerce, fondo neutro.")
      + " Sin texto ni marca de agua.";
  }

  // The typed request for an edit round: her words verbatim, the app's
  // context labelled apart, the alcance chips as structured locks (what the
  // chips leave OUT may not change), the base garment and the real swatch as
  // role-tagged references. The server composes; nothing is concatenated here.
  function editIntent() {
    return buildIntent({
      authored: prompt,
      context: editContext(),
      materials: scopes.includes("tela") && fabric
        ? { "tela objetivo": `${fabric.name}${fabric.comp ? ` (${fabric.comp})` : ""}` }
        : {},
      locks: locksFromScopes(scopes),
      references: [
        item.cover ? { url: abs(item.cover), role: "garment" } : null,
        scopes.includes("tela") && fabric?.swatch
          ? { url: abs(fabric.swatch), role: "fabric" } : null,
      ].filter(Boolean),
    });
  }

  const receiptFrom = (intent, meta, { context = null } = {}) => ({
    authored: intent?.authored_prompt || "",
    context: intent?.atelier_context ?? context,
    intent,
    controlMapping: meta.controlMapping || null,
    model: meta.model || null,
    requestedModel: meta.requestedModel || null,
  });

  // No base yet -> the same button generates it from the item's own spec.
  async function generateBase() {
    setBusy(true); setErr("");
    try {
      const base = [
        `${item.silhouette || "Prenda"} en ${fabric?.name || "tejido de la casa"}${fabric?.comp ? ` (${fabric.comp})` : ""}, color ${colName(item.colorway)}.`,
        item.nota ? item.nota + "." : "",
        prompt.trim() ? prompt.trim() + "." : "",
        dnaPromptBlock(dna), // active brand's own DNA — never hardcoded
        "Foto de producto e-commerce, prenda sola, fondo neutro de estudio, luz natural suave, sin texto ni marca de agua.",
      ].filter(Boolean).join(" ");
      const bp = base + (fabric?.swatch ? " La tela es EXACTAMENTE la del swatch de referencia (foto real de la tela)." : "");
      const refs = [item.refImage && abs(item.refImage), fabric?.swatch && abs(fabric.swatch)].filter(Boolean);
      // Typed path when she typed: HER text is the authored prompt; the spec
      // becomes structured dicts and the DNA/staging goes as labelled context
      // — composed by the server. With nothing typed there is no authored
      // prompt, so the request honestly stays on the composed-prompt path.
      const intent = buildIntent({
        authored: prompt,
        context: [
          item.nota ? item.nota + "." : "",
          dnaPromptBlock(dna),
          "Foto de producto e-commerce, prenda sola, fondo neutro de estudio, luz natural suave, sin texto ni marca de agua.",
          fabric?.swatch ? "La tela es EXACTAMENTE la del swatch de referencia (foto real de la tela)." : "",
        ].filter(Boolean).join(" "),
        garment: { categoria: item.silhouette || "" },
        materials: fabric?.name
          ? { tela: `${fabric.name}${fabric.comp ? ` (${fabric.comp})` : ""}` } : {},
        palette: item.colorway
          ? { color: `${colName(item.colorway)} (${item.colorway})` } : {},
        references: [
          item.refImage ? { url: abs(item.refImage), role: "garment" } : null,
          fabric?.swatch ? { url: abs(fabric.swatch), role: "fabric" } : null,
        ].filter(Boolean),
      });
      let meta = {};
      const url = await callGenerate(bp, refs, (m) => { meta = m; },
        { intent, task: "ideation" });
      setLastSent(receiptFrom(intent, meta, { context: bp }));
      patchItem(item.id, { cover: url, images: [makeVersion("concepto", url, `base · ${fabric?.name || "tela"} · ${colName(item.colorway)}`,
        { prompt: meta.sentPrompt || bp, references: refs, provider: meta.provider, quality, costCents: cost, byId: item.ownerId, byName: team.byId(item.ownerId)?.name }), ...item.images] });
      flash("Base generada con la tela y el color de la prenda");
    } catch (e) { setErr(e.message); flash(e.message); }
    setBusy(false);
  }

  async function generateVariants() {
    if (!item.cover) { generateBase(); return; }
    if (!prompt.trim()) { flash("Escribí qué cambiar"); return; }
    setBusy(true); setErr("");
    try {
      const made = [];
      for (let i = 0; i < nVars; i++) {
        const ep = editPrompt();
        const intent = editIntent();
        const refs = [abs(item.cover), scopes.includes("tela") && fabric?.swatch && abs(fabric.swatch)].filter(Boolean);
        let meta = {};
        const url = await callGenerate(ep, refs, (m) => { meta = m; },
          { intent, task: "garment_edit" });
        setLastSent(receiptFrom(intent, meta));
        made.push(makeVersion("concepto", url, `${prompt.trim().slice(0, 60)} · ${scopes.join("+") || "libre"}`,
          { prompt: meta.sentPrompt || ep, references: refs, provider: meta.provider, quality, costCents: cost, byId: item.ownerId, byName: team.byId(item.ownerId)?.name }));
      }
      patchItem(item.id, { images: [...made, ...item.images] });
      flash(`${made.length} variante${made.length > 1 ? "s" : ""} generada${made.length > 1 ? "s" : ""} — son borradores hasta tu aprobación`);
    } catch (e) { setErr(e.message); flash(e.message); }
    setBusy(false);
  }

  async function genDetailShot() {
    if (!item.cover || busy) return;
    setBusy(true); setErr("");
    try {
      const p = "Primer plano macro del detalle de la prenda de la imagen de referencia — textura de la tela, costuras y gráfica. Foto de producto e-commerce, luz suave, sin texto.";
      let meta = {};
      const url = await callGenerate(p, abs(item.cover), (m) => { meta = m; }, { task: "garment_edit" });
      patchItem(item.id, { detailShot: url, images: [ver("detalle", url, "primer plano", { prompt: p, references: [abs(item.cover)], provider: meta.provider }), ...item.images] });
      setView("detalle");
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  async function genModelShot() {
    if (!item.cover || busy) return;
    setBusy(true); setErr("");
    try {
      const p = "La MISMA prenda de la imagen de referencia, puesta por una modelo, foto editorial de e-commerce de cuerpo entero, fondo neutro claro, luz suave. Mantené fiel diseño, color y textura. Sin texto.";
      let meta = {};
      const url = await callGenerate(p, abs(item.cover), (m) => { meta = m; }, { task: "garment_edit" });
      patchItem(item.id, { modelShot: url, images: [ver("modelo", url, "en modelo · visualización generada", { prompt: p, references: [abs(item.cover)], provider: meta.provider }), ...item.images] });
      setView("modelo");
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  async function genInColor(hex) {
    if (!item.cover || busy) return;
    setBusy(true); setErr("");
    try {
      const p = `La MISMA prenda exacta de la imagen de referencia, en color ${colName(hex)} (${hex}). Cambiá SOLO el color; mantené tela, silueta, gráfica y encuadre idénticos. Sin texto.`;
      let meta = {};
      const url = await callGenerate(p, abs(item.cover), (m) => { meta = m; }, { task: "garment_edit" });
      patchItem(item.id, {
        colorway: hex,
        cover: url,
        images: [ver("concepto", url, `colorway ${colName(hex)}`, { prompt: p, references: [abs(item.cover)], provider: meta.provider }), ...item.images],
      });
      flash(`Colorway ${colName(hex)} generado`);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  const field = (key, placeholder) => (
    <input className="ie-field" value={item[key] || ""} placeholder={placeholder}
      onChange={(e) => patchItem(item.id, { [key]: e.target.value })} />
  );

  return (
    <div className="ie">
      <style dangerouslySetInnerHTML={{ __html: `
        .ie{--b:#2846D8}
        .ie-band{display:grid;grid-template-columns:minmax(240px,1.2fr) 1.45fr 2fr;gap:18px;background:var(--card);border:1px solid var(--line);border-radius:15px;padding:16px 18px;margin-bottom:10px;align-items:start;box-shadow:0 4px 18px rgba(23,24,28,.025)}
        @media(max-width:1100px){.ie-band{grid-template-columns:1fr}}
        .ie-tag{display:inline-block;font-size:11px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--b);background:var(--cobalt-wash);border-radius:6px;padding:3px 8px;margin-bottom:6px}
        .ie-band h2{font-size:19px;font-weight:800;color:var(--ink);margin:0 0 3px;letter-spacing:-.01em}
        .ie-band .sub{font-size:11.5px;color:var(--ink-2);line-height:1.45}
        .ie-k{font-size:11px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3);margin-bottom:6px}
        .ie-guide{display:inline-block;font-style:normal;font-size:10px;font-weight:700;letter-spacing:.02em;text-transform:none;color:#8a6410;background:var(--inferred-wash);border:1px solid var(--inferred);border-radius:999px;padding:1px 7px;vertical-align:middle}
        .ie-ev{display:flex;gap:0;flex-wrap:wrap}
        .ie-ev .e{flex:1;min-width:86px;text-align:center;border-left:1px solid var(--paper-2);padding:2px 8px}
        .ie-ev .e:first-child{border-left:none}
        .ie-ev .l{font-size:11px;color:var(--ink-3);font-weight:700}
        .ie-ev .v{font-size:12px;font-weight:800;color:var(--ink);display:flex;align-items:center;justify-content:center;gap:4px}
        .ie-ev .d{width:7px;height:7px;border-radius:99px;display:inline-block}
        .ie-stagebar{display:flex;align-items:center;gap:6px;margin:0 0 12px;padding:5px;background:#EDECE8;border-radius:12px}
        .ie-stage{flex:1;border:none;background:transparent;border-radius:9px;padding:8px 10px;text-align:left;color:var(--ink-3);cursor:pointer;min-width:0}
        .ie-stage b{display:block;font-size:11px;color:inherit}.ie-stage span{display:block;font-size:11px;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .ie-stage.on{background:var(--card);color:var(--b);box-shadow:0 2px 9px rgba(23,24,28,.07)}.ie-stage.done{color:var(--sage)}
        .ie-lay{display:grid;grid-template-columns:235px minmax(360px,1.45fr) minmax(310px,1fr);gap:14px;align-items:start}
        @media(max-width:1150px){.ie-lay{grid-template-columns:1fr}.ie-stagebar{overflow-x:auto}.ie-stage{min-width:150px}}
        .ie-pane{background:var(--card);border:1px solid var(--line);border-radius:15px;padding:15px 16px;box-shadow:0 4px 18px rgba(23,24,28,.025)}
        .ie-side{position:sticky;top:152px;max-height:calc(100vh - 172px);overflow-y:auto;scrollbar-width:thin}
        .ie-next{background:var(--ink);color:#fff;border-radius:12px;padding:12px 13px;margin-bottom:12px}
        .ie-next .k{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.09em;color:rgba(255,255,255,.55);margin-bottom:4px}
        .ie-next strong{display:block;font-size:13px;line-height:1.25}.ie-next p{font-size:11px;line-height:1.4;color:rgba(255,255,255,.66);margin:4px 0 9px}
        .ie-next button{width:100%;border:none;border-radius:8px;background:#fff;color:var(--ink);font-size:11px;font-weight:800;padding:8px 10px;cursor:pointer}
        .ie-spec .row{padding:7px 0;border-bottom:1px solid var(--paper-2)}
        .ie-spec .row:last-child{border-bottom:none}
        .ie-spec .l{display:block;font-size:11px;color:var(--ink-3);font-weight:700;letter-spacing:.05em;text-transform:uppercase;margin-bottom:2px}
        .ie-spec .v{font-size:12px;font-weight:650;color:var(--ink)}
        .ie-field{width:100%;border:none;background:none;font-size:12px;font-weight:650;color:var(--ink);padding:1px 0;border-bottom:1px dashed transparent}
        .ie-field:focus{outline:none;border-bottom-color:var(--line)}
        .ie-field::placeholder{color:var(--ink-3);font-weight:400}
        .ie-select{width:100%;border:1px solid var(--line);border-radius:8px;background:var(--card);padding:6px 8px;font-size:11px;font-weight:700;color:var(--ink)}
        .ie-swatch{width:64px;height:64px;border-radius:10px;border:1px solid var(--line);object-fit:cover;display:block;margin-top:5px}
        .ie-swatch.ph{display:grid;place-items:center;font-size:11px;color:var(--ink-3);text-align:center;padding:6px;background:var(--paper-2);overflow:hidden}
        .ie-swatch-hint{font-size:11px;color:var(--ink-3);margin-top:4px;line-height:1.4}
        .ie-canvas{position:relative;aspect-ratio:4/5;background:linear-gradient(145deg,#ECEBE7,#F7F6F3);border-radius:13px;overflow:hidden}
        .ie-canvas img{width:100%;height:100%;object-fit:cover;display:block}
        .ie-canvas .ph{position:absolute;inset:0;display:grid;place-items:center;font-size:12px;color:var(--ink-3);text-align:center;padding:20px;line-height:1.6}
        .ie-canvas .cmp{position:absolute;top:10px;left:10px;font-size:11px;font-weight:800;background:rgba(23,24,28,.75);color:#fff;border-radius:999px;padding:4px 10px;letter-spacing:.05em}
        .ie-canvas .spin{position:absolute;inset:0;background:linear-gradient(100deg,#EFEEEA 40%,#fff 50%,#EFEEEA 60%);background-size:200% 100%;animation:iesh 1.2s infinite}
        @keyframes iesh{to{background-position:-200% 0}}
        .ie-views{display:flex;gap:8px;margin-top:9px}
        .ie-vth{position:relative;width:74px;border:1.5px solid var(--line);border-radius:10px;overflow:hidden;cursor:pointer;background:var(--card);padding:0}
        .ie-vth.on{border-color:var(--b)}
        .ie-vth img{width:100%;aspect-ratio:3/4;object-fit:cover;display:block}
        .ie-vth .gen{width:100%;aspect-ratio:3/4;display:grid;place-items:center;font-size:11px;color:var(--ink-3);text-align:center;padding:4px;line-height:1.4}
        .ie-vth span{display:block;font-size:11px;font-weight:700;color:var(--ink-2);text-align:center;padding:3px 0}
        .ie-colors{margin-top:12px}
        .ie-cw{display:flex;gap:7px;flex-wrap:wrap}
        .ie-c{width:26px;height:26px;border-radius:999px;border:1.5px solid var(--line);cursor:pointer;padding:0;position:relative}
        .ie-c.on{box-shadow:0 0 0 2px var(--card),0 0 0 4px var(--b)}
        .ie-c:hover:after{content:"✦";position:absolute;inset:0;display:grid;place-items:center;color:#fff;font-size:11px;text-shadow:0 1px 2px rgba(0,0,0,.5)}
        .ie-note{font-size:11px;color:var(--ink-3);margin-top:6px;line-height:1.45}
        .ie-personas{margin-top:14px;border-top:1px solid var(--paper-2);padding-top:11px}
        .ie-personas .ie-k{display:flex;justify-content:space-between;align-items:baseline}
        .pk-act{font-size:11px;font-weight:600;letter-spacing:0;text-transform:none;color:var(--b);cursor:pointer;background:none;border:none;padding:0}
        .ie-padd{display:flex;gap:6px;margin-bottom:9px}
        .ie-padd input[type=text],.ie-padd input:not([type]){flex:1;border:1px solid var(--line);border-radius:8px;background:var(--paper-2);padding:7px 9px;font-size:11px;color:var(--ink)}
        .ie-padd .up{border:1px solid var(--b);border-radius:8px;color:var(--b);font-size:11px;font-weight:700;padding:7px 11px;cursor:pointer;white-space:nowrap}
        .ie-padd .up.off{opacity:.45;cursor:default}
        .ie-pgrid{display:flex;gap:8px;flex-wrap:wrap}
        .ie-p{position:relative;width:86px}
        .ie-p img{width:86px;height:108px;object-fit:cover;border-radius:10px;border:1px solid var(--line);display:block}
        .ie-p .rm{position:absolute;top:4px;right:4px;width:18px;height:18px;border:none;border-radius:6px;background:rgba(23,24,28,.55);color:#fff;font-size:11px;cursor:pointer}
        .ie-p .try{width:100%;margin-top:4px;border:1px solid var(--line);border-radius:7px;background:var(--paper-2);font-size:11px;font-weight:700;padding:5px 2px;cursor:pointer;color:var(--ink-2)}
        .ie-p .try:hover{color:var(--b);border-color:var(--b)}
        .ie-p .try:disabled{opacity:.45}
        .ie-tabs{display:flex;border-bottom:1px solid var(--line);margin:-2px 0 12px}
        .ie-tab{flex:1;border:none;background:none;font-size:12px;font-weight:700;color:var(--ink-3);padding:8px 4px;cursor:pointer;border-bottom:2px solid transparent}
        .ie-tab.on{color:var(--b);border-bottom-color:var(--b)}
        .ie-prompt{width:100%;min-height:84px;border:1px solid var(--line);border-radius:10px;background:var(--paper-2);padding:10px 12px;font-size:12px;line-height:1.5;color:var(--ink);resize:vertical}
        .ie-scopes{display:flex;gap:5px;flex-wrap:wrap;margin:9px 0 4px}
        .ie-scope{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--line);border-radius:999px;background:var(--card);font-size:11px;font-weight:700;padding:6px 11px;cursor:pointer;color:var(--ink-2)}
        .ie-scope.on{border-color:var(--b);color:var(--b);background:var(--cobalt-wash)}
        .ie-refs{display:flex;gap:8px;margin:10px 0}
        .ie-ref{width:64px;text-align:center}
        .ie-ref img{width:64px;height:78px;border-radius:9px;object-fit:cover;border:1.5px solid var(--b)}
        .ie-ref.off img{border-color:var(--line);opacity:.8}
        .ie-ref span{font-size:11px;color:var(--ink-3);font-weight:600;display:block;margin-top:3px;line-height:1.25}
        .ie-opts{display:flex;gap:8px;margin:8px 0 4px}
        .ie-opts label{flex:1;font-size:11px;font-weight:700;color:var(--ink-3);text-transform:uppercase;letter-spacing:.05em}
        .ie-opts select{width:100%;border:1px solid var(--line);border-radius:8px;background:var(--card);padding:7px 8px;font-size:11.5px;font-weight:600;color:var(--ink);margin-top:3px}
        .ie-cost{font-size:11px;color:var(--ink-3);margin:6px 0 9px;text-align:right}
        .ie-go{width:100%;border:none;border-radius:10px;background:var(--b);color:#fff;font-size:12.5px;font-weight:750;padding:12px;cursor:pointer;box-shadow:0 5px 14px rgba(40,70,216,.16)}
        .ie-go:disabled{opacity:.5}
        .ie-err{font-size:11px;color:var(--clay);font-weight:600;margin-top:8px}
        /* filmstrip + decision */
        .ie-foot{display:block;margin-top:14px}
        .ie-strip{display:flex;gap:9px;overflow-x:auto;padding:3px 2px 6px}
        .ie-v{flex:none;width:120px;background:var(--card);border:1.5px solid var(--line);border-radius:12px;overflow:hidden}
        .ie-v.on{border-color:var(--b)}
        .ie-v img{width:100%;aspect-ratio:3/4;object-fit:cover;display:block;cursor:pointer}
        .ie-v .b{padding:6px 8px}
        .ie-v .t{font-size:11px;font-weight:800;color:var(--ink)}
        .ie-v .n{font-size:11px;color:var(--ink-3);line-height:1.3;height:22px;overflow:hidden}
        .ie-v button{width:100%;border:1px solid var(--line);border-radius:7px;background:var(--paper-2);font-size:11px;font-weight:700;padding:4px;cursor:pointer;color:var(--ink-2);margin-top:4px}
        .ie-cmp-t{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:700;color:var(--ink-2);margin-bottom:8px}
        .ie-sw{width:34px;height:18px;border-radius:99px;background:var(--line);position:relative;cursor:pointer;border:none;padding:0}
        .ie-sw.on{background:var(--b)}
        .ie-sw i{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:99px;background:#fff;transition:left .12s}
        .ie-sw.on i{left:18px}
        .ie-review-card{margin-top:14px;padding-top:14px;border-top:1px solid var(--line)}
        .ie-dec .chip{display:inline-block;font-size:11px;font-weight:800;color:var(--b);background:var(--cobalt-wash);border-radius:999px;padding:4px 9px;margin-bottom:8px}
        .ie-rate{display:flex;gap:4px;flex-wrap:wrap;margin:4px 0}
        .ie-rate button{width:23px;height:23px;border-radius:7px;border:1px solid var(--line);background:var(--card);font-size:11px;font-weight:700;cursor:pointer;color:var(--ink-2)}
        .ie-rate button.on{background:var(--ink);color:#fff;border-color:var(--ink)}
        .ie-dec .why{font-size:11px;color:var(--ink-2);line-height:1.45;margin:6px 0 10px}
        .ie-apr{width:100%;border:none;border-radius:10px;background:var(--b);color:#fff;font-size:12px;font-weight:750;padding:12px;cursor:pointer;margin-top:7px;box-shadow:0 5px 14px rgba(40,70,216,.14)}
        .ie-apr:disabled{opacity:.45}
        .ie-apr.ok{background:var(--sage)}
        .ie-save{width:100%;border:1px solid var(--line);border-radius:10px;background:var(--card);font-size:11.5px;font-weight:700;padding:10px;cursor:pointer;color:var(--ink)}
        .ie-foot-note{font-size:11px;color:var(--ink-3);text-align:center;margin-top:7px}
      ` }} />

      {/* ===== evidence band ===== */}
      <div className="ie-band">
        <div>
          <span className="ie-tag">{coll.name}</span>
          <h2>{item.name || item.silhouette || "Prenda"}</h2>
          <div className="sub">Versión propuesta · código {code}</div>
        </div>
        <div>
          <div className="ie-k">Por qué</div>
          <div className="sub">{item.nota || "Sin nota de diseño — agregala en el panel de especificación."}</div>
        </div>
        <div>
          <div className="ie-k">Evidencia</div>
          <div className="ie-ev">
            <div className="e"><div className="l">Diferenciación</div>
              <div className="v">{dif.score == null ? <span title="sin ADN de marca ni tendencias del engine para comparar">s/d</span> : <><span className="d" style={{ background: dif.band === "open" ? "var(--sage)" : dif.band === "adjacent" ? "var(--ochre)" : "var(--clay)" }} />{dif.score}</>}</div></div>
            <div className="e"><div className="l">Ajuste de marca</div>
              <div className="v">{item.rating ? <><span className="d" style={{ background: "var(--sage)" }} />{item.rating}.0</> : <span style={{ color: "var(--ink-3)" }}>sin puntuar</span>}</div></div>
            <div className="e"><div className="l">Tela</div><div className="v" style={{ fontSize: 10.5 }}>{fabric?.name || "—"}</div></div>
            <div className="e"><div className="l">Versiones</div><div className="v">{item.images.length}</div></div>
            <div className="e"><div className="l">Responsable</div><div className="v" style={{ fontSize: 10.5 }}>{owner?.initials || "—"}</div></div>
            <div className="e"><div className="l">Aprueba</div><div className="v" style={{ fontSize: 10.5 }}>{approver?.initials || "—"}</div></div>
            <div className="e"><div className="l">Estado</div>
              <div className="v" style={{ fontSize: 10.5 }}>{approvalLabel(workflowStatus)}</div></div>
          </div>
        </div>
      </div>

      <div className="ie-stagebar" aria-label="Flujo de la prenda">
        <button className="ie-stage done" onClick={() => document.querySelector(".ie-spec")?.scrollIntoView({ behavior: "smooth", block: "center" })}>
          <b>1 · Brief y ficha</b><span>silueta, tela y razón de diseño</span>
        </button>
        <button className={`ie-stage${tab === "ia" ? " on" : ""}`} onClick={() => setTab("ia")}>
          <b>2 · Crear y refinar</b><span>{item.images.length ? `${item.images.length} versiones` : "generá la primera base"}</span>
        </button>
        <button className={`ie-stage${tab === "com" ? " on" : ""}`} onClick={() => setTab("com")}>
          <b>3 · Definición comercial</b><span>precio, tirada y entrega</span>
        </button>
        <button className={`ie-stage${item.approved ? " done" : ""}`} onClick={() => document.getElementById("studio-review")?.scrollIntoView({ behavior: "smooth", block: "center" })}>
          <b>4 · Revisión</b><span>{item.approved ? "aprobada para desarrollo" : workflowStatus === "in_review" ? `esperando a ${approver?.name || "aprobación"}` : item.rating ? `fit ${item.rating}/10 · enviar` : "puntuar y decidir"}</span>
        </button>
      </div>

      <div className="ie-lay">
        {/* ===== left — commercial spec ===== */}
        <div className="ie-pane ie-spec">
          <div className="ie-k" style={{ marginBottom: 4 }}>Especificación</div>
          <div className="row"><div className="l">Categoría</div><div className="v">{item.silhouette || "—"}</div></div>
          <div className="row"><div className="l">Subcategoría</div>{field("subcat", "wide leg, boxy…")}</div>
          <div className="row"><div className="l">Código interno</div><div className="v" style={{ fontFamily: "var(--d)", fontSize: 11 }}>{code}</div></div>
          <div className="row"><label className="l" htmlFor={`owner-${item.id}`}>Responsable de diseño</label>
            <select id={`owner-${item.id}`} className="ie-select" value={item.ownerId || ""} onChange={(event) => changeOwner(event.target.value)}>
              <option value="">Sin asignar</option>{team.members.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.role}</option>)}
            </select>
          </div>
          <div className="row"><label className="l" htmlFor={`approver-${item.id}`}>Aprobación creativa</label>
            <select id={`approver-${item.id}`} className="ie-select" value={item.approverId || ""} onChange={(event) => patchItem(item.id, { approverId: event.target.value })}>
              <option value="">Sin asignar</option>{availableApprovers.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.role}</option>)}
            </select>
          </div>
          <div className="row"><label className="l" htmlFor={`due-${item.id}`}>Fecha de revisión</label><input id={`due-${item.id}`} className="ie-select" type="date" value={item.dueAt || ""} onChange={(event) => patchItem(item.id, { dueAt: event.target.value })} /></div>
          <div className="row">
            <div className="l">Tela principal</div>
            <div className="v">{fabric?.name || "—"}</div>
            {fabric?.swatch
              ? <img className="ie-swatch" src={fabric.swatch} alt={`swatch ${fabric.name}`} title="Swatch real subido por el equipo" />
              : (
                // ⚠ A 44-character sentence used to live INSIDE the 64×64
                // swatch square, so it overflowed the box and printed over the
                // Composición row beneath it. The square keeps the layout and
                // says only "sin swatch"; the instruction sits under it, where
                // there is a line to put it on.
                <>
                  <div className="ie-swatch ph">sin swatch</div>
                  <div className="ie-swatch-hint">subilo en la biblioteca de telas</div>
                </>
              )}
          </div>
          <div className="row"><div className="l">Composición</div><div className="v">{fabric?.comp || "—"}</div></div>
          <div className="row"><div className="l">Peso</div>{field("peso", "— g/m²")}</div>
          <div className="row"><div className="l">Origen / proveedor</div><div className="v">{fabric?.proveedor || "—"}</div></div>
          <div className="row"><div className="l">Nota de diseño</div>{field("nota", "qué la hace de la marca…")}</div>
          <div className="ie-note">los campos con guion los completa el equipo — nunca los inventamos</div>
        </div>

        {/* ===== center — canvas ===== */}
        <div className="ie-pane">
          <div className="ie-canvas">
            {busy && <div className="spin" />}
            {!busy && (shown
              ? <img src={abs(shown)} alt={item.name} />
              : <div className="ph">Sin concepto todavía.<br />Escribí en &quot;Crear con IA&quot; qué querés ver y generá la base — se renderiza con {fabric?.name || "su tela"}.</div>)}
            {compare && original && !busy && <span className="cmp">ORIGINAL</span>}
            {view === "modelo" && !compare && !busy && item.modelShot && <span className="cmp">EN MODELO · VISUALIZACIÓN GENERADA</span>}
          </div>
          <div className="ie-views">
            <button className={`ie-vth${view === "frente" ? " on" : ""}`} onClick={() => setView("frente")}>
              {item.cover ? <img src={abs(item.cover)} alt="frente" /> : <div className="gen">base</div>}<span>Frente</span>
            </button>
            <button className={`ie-vth${view === "detalle" ? " on" : ""}`} onClick={() => item.detailShot ? setView("detalle") : genDetailShot()} disabled={busy || !item.cover}>
              {item.detailShot ? <img src={abs(item.detailShot)} alt="detalle" /> : <div className="gen">✦ generar<br />primer plano<br />~{cost}¢</div>}<span>Detalle</span>
            </button>
            <button className={`ie-vth${view === "modelo" ? " on" : ""}`} onClick={() => item.modelShot ? setView("modelo") : genModelShot()} disabled={busy || !item.cover}>
              {item.modelShot ? <img src={abs(item.modelShot)} alt="en modelo" /> : <div className="gen">✦ generar<br />en modelo<br />~{cost}¢</div>}<span>En modelo</span>
            </button>
          </div>
          <div className="ie-colors">
            <div className="ie-k">Colores propuestos</div>
            <div className="ie-cw">
              {palette.map((h) => (
                <button key={h} className={`ie-c${item.colorway === h ? " on" : ""}`} style={{ background: h }}
                  title={`${colName(h)} — ✦ genera la prenda en este color (~${cost}¢)`}
                  disabled={busy} onClick={() => genInColor(h)} />
              ))}
            </div>
            <div className="ie-note">tocá un color y la prenda se regenera en ese colorway — el pedido de &quot;solo el color&quot; viaja como guía de prompt, no como parámetro</div>
          </div>
          <div className="ie-personas">
            <div className="ie-k">Probar en persona real
              <button className="pk-act" onClick={() => setAddingPersona((a) => !a)}>{addingPersona ? "cerrar" : "＋ persona"}</button>
            </div>
            {addingPersona && (
              <div className="ie-padd">
                <input value={personaName} onChange={(e) => setPersonaName(e.target.value)} placeholder="Nombre — Sofía (fit model)…" />
                <label className={`up${personaName.trim() ? "" : " off"}`}>
                  subir foto
                  <input type="file" accept="image/*" hidden disabled={!personaName.trim()}
                    onChange={(e) => addPersona(e.target.files[0])} />
                </label>
              </div>
            )}
            {personas.length === 0 && !addingPersona && (
              <div className="ie-note">subí fotos reales de tu equipo o fit models (con su consentimiento) y probá cada concepto sobre ellas</div>
            )}
            <div className="ie-pgrid">
              {personas.map((p) => (
                <div key={p.id} className="ie-p">
                  <img src={p.image} alt={p.name} />
                  <button className="rm" title="Quitar" onClick={() => removePersona(p.id)}>✕</button>
                  <button className="try" disabled={!item.cover || busy || !!tryingId} onClick={() => tryOnPersona(p)}>
                    {tryingId === p.id ? "Probando…" : `Probar en ${p.name.split(" ")[0]}`}
                  </button>
                </div>
              ))}
            </div>
            {personas.length > 0 && (
              <div className="ie-note">con FASHN_API_KEY es un try-on real (~1 crédito); sin clave es una visualización generada y queda etiquetada así. Alta (partner de Public School) aún no abre API pública.</div>
            )}
          </div>
        </div>

        {/* ===== right — crear con IA ===== */}
        <div className="ie-pane ie-side">
          <div className="ie-next">
            <div className="k">Próximo paso</div>
            <strong>{item.approved ? "Prenda lista para desarrollo" : !item.cover ? "Generá la primera base" : !item.rating ? "Evaluá el ajuste de marca" : workflowStatus === "in_review" ? `Revisión pendiente con ${approver?.name || "el aprobador"}` : "Enviá la propuesta a revisión"}</strong>
            <p>{item.approved
              ? "La decisión ya está registrada en el pipeline."
              : !item.cover
                ? `Atelier usará ${fabric?.name || "la tela elegida"}, el color y la nota de diseño.`
                : !item.rating
                  ? "Elegí un puntaje del 1 al 10 para dejar explícito el criterio del equipo."
                  : workflowStatus === "in_review"
                    ? "La persona aprobadora puede pedir cambios o habilitar el pase a desarrollo."
                    : "Confirmá responsable, aprobador y fecha antes de enviarla."}</p>
            {item.approved ? (
              <button onClick={onClose}>Ver colección</button>
            ) : !item.cover ? (
              <button disabled={busy} onClick={generateBase}>{busy ? "Generando…" : `✦ Generar base · ~${cost}¢`}</button>
            ) : !item.rating ? (
              <button onClick={() => document.getElementById("studio-review")?.scrollIntoView({ behavior: "smooth", block: "center" })}>Evaluar diseño</button>
            ) : workflowStatus === "in_review" ? (
              <button onClick={() => approve(item)}>Aprobar como {approver?.name || "aprobador"} →</button>
            ) : (
              <button onClick={submitForReview}>Enviar a revisión →</button>
            )}
          </div>
          <div className="ie-tabs">
            <button className={`ie-tab${tab === "ia" ? " on" : ""}`} onClick={() => setTab("ia")}>Crear con IA</button>
            <button className={`ie-tab${tab === "com" ? " on" : ""}`} onClick={() => setTab("com")}>Definición comercial</button>
          </div>
          {tab === "ia" ? (
            <>
              <div className="ie-k">Editar con IA</div>
              <textarea className="ie-prompt" value={prompt} maxLength={500}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder='Qué cambiar — "alargá el tiro 2 cm, abrí la pierna y mantené la sarga chocolate"…' />
              {/* The chips travel as structured LOCKS (what queda afuera no
                  cambia), but on every configured model locks are still
                  compiled into the prompt — the mapping says prompt_guidance,
                  so the heading says it too instead of implying a parameter. */}
              <div className="ie-k" style={{ marginTop: 10 }}>Alcance de la edición <i className="ie-guide">{GUIDANCE_LABEL}</i></div>
              <div className="ie-scopes">
                {SCOPES.map(([k, l]) => (
                  <button key={k} className={`ie-scope${scopes.includes(k) ? " on" : ""}`} onClick={() => toggleScope(k)}>
                    {scopes.includes(k) ? "✓" : ""} {l}
                  </button>
                ))}
              </div>
              {/* The engine sends each reference with su rol ("use only for
                  fabric"), but the roles compile into the prompt — mapping:
                  prompt_guidance — so the heading carries the same label. */}
              <div className="ie-k" style={{ marginTop: 8 }}>Referencias <i className="ie-guide">{GUIDANCE_LABEL}</i></div>
              <div className="ie-refs">
                <div className="ie-ref">
                  {item.cover ? <img src={abs(item.cover)} alt="base" /> : <div className="ie-swatch ph" style={{ width: 64, height: 78 }}>sin base</div>}
                  <span>Producto base<br />(se envía)</span>
                </div>
                {fabric?.swatch && (
                  <div className={`ie-ref${scopes.includes("tela") ? "" : " off"}`}>
                    <img src={abs(fabric.swatch)} alt="swatch" />
                    <span>Swatch real<br />{scopes.includes("tela") ? "(se envía)" : "(activá alcance Tela)"}</span>
                  </div>
                )}
              </div>
              <div className="ie-note" style={{ marginTop: -4 }}>{fabric?.swatch
                ? "con el alcance Tela activo, el swatch REAL viaja como referencia junto al producto base"
                : "subí un swatch real en la biblioteca de telas y la generación lo usa como referencia"}</div>
              <div className="ie-opts">
                {/* ⚠ "Fidelidad" is PROSE, not a parameter: no configured
                    model exposes an input-fidelity knob (gpt-image-2's is
                    always-high with no parameter), so alta/media only changes
                    the guidance sentence the server compiles. The label says
                    so — implying a native control here was the owner's
                    sharpest correction. */}
                <label>Fidelidad <i className="ie-guide">{GUIDANCE_LABEL}</i>
                  <select value={fidelity} onChange={(e) => setFidelity(e.target.value)}>
                    <option value="alta">Alta</option><option value="media">Media</option>
                  </select>
                </label>
                <label>Variantes
                  <select value={nVars} onChange={(e) => setNVars(Number(e.target.value))}>
                    {[1, 2, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              </div>
              <div className="ie-cost">≈{nVars * cost}¢ esta tanda · borradores hasta aprobar</div>
              <button className="ie-go" disabled={busy} onClick={generateVariants}>
                {busy ? "Generando…" : item.cover ? `✦ Generar ${nVars} variante${nVars > 1 ? "s" : ""}` : "✦ Generar base"}
              </button>
              {!item.cover && <div className="ie-note" style={{ marginTop: 8 }}>la base se renderiza con la tela, el color y la nota de la prenda — el prompt de arriba es opcional acá</div>}
              {err && <div className="ie-err">{err}</div>}
              <GenerationReceipt sent={lastSent} />
            </>
          ) : (
            <>
              <div className="ie-k">Definición comercial</div>
              <div className="ie-spec">
                <div className="row"><div className="l">Precio objetivo</div>{field("precio", "AR$ —")}</div>
                <div className="row"><div className="l">Tirada de test</div>{field("qty", "— unidades")}</div>
                <div className="row"><div className="l">Entrega a tienda</div>{field("entrega", "— fecha")}</div>
                <div className="row"><div className="l">Consumo de tela</div>{field("consumo", "— metros por prenda")}</div>
                {fabric?.precio_m && <div className="row"><div className="l">Tela · precio por metro</div><div className="v">AR${fabric.precio_m}</div></div>}
                {fabric?.moq_m && <div className="row"><div className="l">Tela · MOQ</div><div className="v">{fabric.moq_m} m</div></div>}
                {fabric?.lead && <div className="row"><div className="l">Tela · lead time</div><div className="v">{fabric.lead} días</div></div>}
                {fabric?.precio_m && item.consumo && !isNaN(parseFloat(item.consumo)) && (
                  <div className="row"><div className="l">Costo de tela por prenda</div>
                    <div className="v" style={{ color: "var(--b)" }}>
                      ≈ AR${Math.round(parseFloat(item.consumo) * parseFloat(String(fabric.precio_m).replace(/[^0-9.]/g, "")) || 0).toLocaleString("es-AR")}
                      <span style={{ fontWeight: 400, color: "var(--ink-3)" }}> · consumo × precio/m</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="ie-note">números del equipo, aritmética a la vista — nada se estima solo. Cuando cargues tus ventas, el plan semanal propone tiradas con evidencia</div>
            </>
          )}

          <div className="ie-review-card ie-dec" id="studio-review">
            <div className="ie-k">Decisión del equipo</div>
            <span className="chip">● {approvalLabel(workflowStatus)}</span>
            <div className="why" style={{ marginTop: 7 }}><b>{owner?.name || "Sin responsable"}</b> diseña · <b>{approver?.name || "Sin aprobador"}</b> decide. La firma comercial ocurre después.</div>
            <div className="ie-k" style={{ marginTop: 4 }}>Ajuste de marca · tu criterio</div>
            <div className="ie-rate">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => (
                <button key={v} className={item.rating === v ? "on" : ""} onClick={() => patchItem(item.id, { rating: v })}>{v}</button>
              ))}
            </div>
            <div className="why">
              {dif.score == null
                ? "Sin ADN de marca ni tendencias del engine, no hay contra qué medir diferenciación."
                : BAND_ES[dif.band]}{dif.nearest && <> · lo más cercano: <b>{dif.nearest.name}</b> ({OWNER_ES[dif.nearest.owner] || dif.nearest.owner}, {dif.nearest.sim}%)</>}
            </div>
            <textarea className="ie-prompt" style={{ minHeight: 54, marginBottom: 9 }} value={item.reviewNote || ""}
              onChange={(event) => patchItem(item.id, { reviewNote: event.target.value })}
              placeholder="Comentario de revisión: qué funciona, qué debe cambiar, condiciones para aprobar…" />
            <button className="ie-save" onClick={() => { if (onCommit()) onClose(); }}>Guardar borrador</button>
            {item.approved ? (
              <button className="ie-apr ok" onClick={onClose}>✓ Aprobada — ver colección</button>
            ) : workflowStatus === "in_review" ? (
              <>
                <button className="ie-save" style={{ marginTop: 7 }} onClick={() => { patchItem(item.id, { approvalStatus: "changes" }); flash("Cambios pedidos — vuelve a la responsable"); }}>Pedir cambios</button>
                <button className="ie-apr" onClick={() => approve(item)}>Aprobar como {approver?.name || "aprobador"} →</button>
              </>
            ) : (
              <button className="ie-apr" disabled={!readyForReview}
                title={!readyForReview ? "Completá responsable, aprobador, fecha, base y ajuste de marca" : ""}
                onClick={submitForReview}>
                Enviar a revisión de {approver?.name || "aprobador"} →
              </button>
            )}
            <div className="ie-foot-note">{item.approved ? `Aprobada por ${approver?.name || "el equipo"}` : workflowStatus === "in_review" ? "Quien diseña no da la aprobación final" : !readyForReview ? "Completá ficha, fecha, base y criterio para enviar" : "Lista para revisión creativa"}</div>
          </div>
        </div>
      </div>

      {/* ===== version filmstrip ===== */}
      <div className="ie-foot">
        <div className="ie-pane">
          <div className="ie-cmp-t">
            Historial de versiones ({item.images.length})
            {original && item.cover !== original.url && (
              <>
                <span style={{ marginLeft: "auto" }}>Original</span>
                <button className={`ie-sw${!compare ? " on" : ""}`} onClick={() => setCompare((c) => !c)} title="Comparar con el original"><i /></button>
                <span>Actual</span>
              </>
            )}
          </div>
          <div className="ie-strip">
            {item.images.map((v, i) => (
              <div key={v.url + i} className={`ie-v${item.cover === v.url ? " on" : ""}`}>
                <img src={abs(v.url)} alt={versionAlt(v)}
                  title={[v.prompt && `“${v.prompt.slice(0, 140)}”`, v.provider && `vía ${v.provider}`, v.by && `por ${v.by}`, v.cost_cents != null && `~${v.cost_cents}¢`, v.references?.length ? `${v.references.length} ref` : null].filter(Boolean).join(" · ") || undefined}
                  role="button" tabIndex={0} style={{ cursor: "zoom-in" }}
                  onClick={() => window.open(abs(v.url), "_blank")}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); window.open(abs(v.url), "_blank"); } }} />
                <div className="b">
                  <div className="t">{v.kind === "concepto" ? `V${item.images.filter(x => x.kind === "concepto").length - item.images.slice(0, i + 1).filter(x => x.kind === "concepto").length + 1}` : v.kind.toUpperCase()}</div>
                  <div className="n">{v.note}</div>
                  {v.kind === "concepto" && item.cover !== v.url && (
                    <button onClick={() => patchItem(item.id, { cover: v.url })}>Usar versión</button>
                  )}
                  <button onClick={() => exportPng(v.url, `${coll.name}-${item.name || item.silhouette}-${v.kind}`)}>PNG ↓</button>
                </div>
              </div>
            ))}
            {item.images.length === 0 && <div className="ie-note">las versiones que generes quedan acá, con su nota</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
