"use client";
// Plan semanal — the product (2026-07-19 reframe): five merchandise actions
// from the brand's own sales + stock, each with inspectable evidence, each
// ending in a human decision. Accepting (with an optionally MODIFIED qty —
// the modification is signal, we log both numbers) writes to the same
// append-only decisions ledger as Proposals, so every plan action enters the
// 14-day outcome loop in Decisions & outcomes automatically.
//
// No sales data yet -> the panel IS the connector: drop the CSV the team can
// export today (es/en headers, ;/,, dd/mm — the engine maps them and echoes
// how it read the columns). No engine -> one honest line, no fake plan.
import { useEffect, useRef, useState } from "react";
import { getPlan, getSalesSummary, postDecision, uploadSalesCsv } from "@/lib/api";
import { useEngine } from "@/components/EngineProvider";
import { readScoped, writeScoped } from "@/lib/brandStore";

const TYPES = {
  reponer: { label: "Reponer", bg: "var(--sage)", col: "#fff" },
  reducir: { label: "Reducir", bg: "var(--clay)", col: "#fff" },
  precio: { label: "Precio", bg: "var(--ochre-wash)", col: "var(--ink)" },
  extender: { label: "Extender", bg: "var(--cobalt)", col: "#fff" },
  testear: { label: "Testear", bg: "var(--night)", col: "#fff" },
};
const CONF = { alta: "var(--sage)", media: "var(--ochre)", baja: "var(--clay)" };
const LOCAL_KEY = "atelier-decisions"; // Decisions view's local mirror

// ⚠ THIS WROTE THE GLOBAL KEY WHILE EVERY READER READ THE SCOPED ONE (owner
// review, third pass 2026-08-11). `Decisions` and `lib/ledger.js` both go
// through `readScoped(DECISIONS_KEY, brandId)`, so a decision recorded here
// landed somewhere nothing looks — the mirror was not merely unscoped, it was
// INVISIBLE to the ledger it exists to mirror. Two failures in one line: a
// decision that vanishes from its own brand, and one brand's decisions sitting
// in a key another brand could read if anything ever did.
function mirrorLocally(rec, brandId) {
  const rows = readScoped(LOCAL_KEY, brandId, []) || [];
  writeScoped(LOCAL_KEY, brandId, [rec, ...rows].slice(0, 300));
}

function ActionCard({ a, brandId, salesThrough, onDone }) {
  const [qty, setQty] = useState(a.qty);
  const [busy, setBusy] = useState(false);
  const t = TYPES[a.type] || TYPES.testear;
  const modified = a.qty != null && qty !== a.qty;

  async function decide(decision) {
    setBusy(true);
    const rec = {
      candidate_key: `plan:${a.type}:${a.product_key}:${salesThrough}`.slice(0, 120),
      decision,
      reason: decision === "accept" ? (modified ? `qty ${a.qty}→${qty}` : null) : "pasada",
      candidate: {
        kind: "plan-action", title: a.headline, trend: "Plan semanal",
        type: a.type, product_key: a.product_key, qty_suggested: a.qty,
        qty_final: decision === "accept" ? qty : null, evidence: a.evidence,
        confidence: a.confidence, data: a.data, sales_through: salesThrough,
      },
      created_at: new Date().toISOString(),
    };
    mirrorLocally({ ...rec, id: `local-${rec.candidate_key}` }, brandId);
    try {
      await postDecision(brandId, {
        candidateKey: rec.candidate_key, decision, reason: rec.reason, candidate: rec.candidate,
      });
    } catch { /* kept locally; engine sync is best-effort */ }
    onDone(a, decision, qty);
  }

  return (
    <div className="wp-card">
      <div className="wp-head">
        <span className="wp-type" style={{ background: t.bg, color: t.col }}>{t.label}</span>
        <span className="wp-conf" style={{ color: CONF[a.confidence] }}>confianza {a.confidence}</span>
      </div>
      <div className="wp-headline">{a.headline}</div>
      <ul className="wp-ev">
        {a.evidence.map((e, i) => <li key={i}>{e}</li>)}
      </ul>
      <div className="wp-acts">
        {a.qty != null && (
          <label className="wp-qty">
            <input type="number" min={0} value={qty} disabled={busy}
              onChange={(e) => setQty(Math.max(0, parseInt(e.target.value || "0", 10)))} />
            u{modified && <em> (sugerido {a.qty})</em>}
          </label>
        )}
        <button className="wp-go" disabled={busy} onClick={() => decide("accept")}>
          {modified ? "Aceptar modificado" : "Aceptar"} →
        </button>
        <button className="wp-pass" disabled={busy} onClick={() => decide("reject")}>Pasá</button>
      </div>
    </div>
  );
}

function Uploader({ brandId, onUploaded }) {
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const ventasRef = useRef(null);
  const stockRef = useRef(null);

  async function send(kind, file) {
    if (!file) return;
    setBusy(true); setMsg(null);
    try {
      const text = await file.text();
      const res = await uploadSalesCsv(brandId, kind, text, file.name);
      setMsg({ ok: true, text: `${res.rows} filas de ${kind} cargadas · columnas leídas: ${Object.entries(res.mapping).map(([k, v]) => `${v}→${k}`).join(", ")}${res.warnings.length ? ` · ${res.warnings.length} filas salteadas` : ""}` });
      onUploaded();
    } catch (e) {
      setMsg({ ok: false, text: `No pude leer el archivo: ${e.message}` });
    }
    setBusy(false);
  }

  return (
    <div className="wp-upload">
      <div className="wp-up-t">Conectá tus números — arranca con lo que ya exportás hoy</div>
      <p>Un CSV de <b>ventas</b> (fecha, producto, cantidad — headers en castellano o inglés, como venga)
        y si tenés, uno de <b>stock</b> (producto, unidades). El plan sale de tus números reales; sin ellos no se inventa nada.</p>
      <div className="wp-up-btns">
        <input ref={ventasRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => send("ventas", e.target.files[0])} />
        <input ref={stockRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => send("stock", e.target.files[0])} />
        <button className="wp-go" disabled={busy} onClick={() => ventasRef.current?.click()}>Subir CSV de ventas</button>
        <button className="wp-pass" disabled={busy} onClick={() => stockRef.current?.click()}>Subir CSV de stock (opcional)</button>
      </div>
      {msg && <div className={`wp-msg${msg.ok ? "" : " err"}`}>{msg.text}</div>}
    </div>
  );
}

export default function WeeklyPlan() {
  const engine = useEngine();
  // The weekly plan is powered by the brand's own sales/stock rows, not by a
  // market-intelligence run. A connected brand without a run must still be
  // able to upload its CSVs and operate.
  const connected = Boolean(engine.connected && engine.brandId);
  const [plan, setPlan] = useState(null);
  const [summary, setSummary] = useState(null);
  const [hidden, setHidden] = useState({});
  const [toast, setToast] = useState("");

  const refresh = () => {
    if (!engine.brandId) return;
    getPlan(engine.brandId).then(setPlan);
    getSalesSummary(engine.brandId).then(setSummary);
  };
  useEffect(() => { if (connected) refresh(); }, [connected, engine.brandId]); // eslint-disable-line react-hooks/exhaustive-deps

  function done(a, decision, qty) {
    setHidden((h) => ({ ...h, [a.product_key + a.type]: true }));
    setToast(decision === "accept"
      ? `${TYPES[a.type].label} aceptada${a.qty != null && qty !== a.qty ? ` (${a.qty}→${qty} u)` : ""} — queda en Decisions & outcomes, lectura a 14 días`
      : "Pasada — el sistema aprende igual");
    clearTimeout(window.__wpt); window.__wpt = setTimeout(() => setToast(""), 2600);
  }

  const actions = (plan?.actions || []).filter((a) => !hidden[a.product_key + a.type]);
  const ds = plan?.data_status;

  return (
    <div className="wp">
      <style dangerouslySetInnerHTML={{ __html: `
        .wp{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin-bottom:18px}
        .wp-bar{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:12px}
        .wp-bar h2{font-size:15px;font-weight:800;color:var(--ink);margin:0}
        .wp-bar .st{font-size:11px;color:var(--ink-3)}
        .wp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:11px}
        .wp-card{border:1px solid var(--line);border-radius:12px;padding:12px 14px;background:var(--paper-2)}
        .wp-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:7px}
        .wp-type{font-size:11px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;border-radius:999px;padding:3px 10px}
        .wp-conf{font-size:11px;font-weight:700;letter-spacing:.03em}
        .wp-headline{font-size:13.5px;font-weight:700;color:var(--ink);line-height:1.3;margin-bottom:7px}
        .wp-ev{margin:0 0 10px;padding-left:16px}
        .wp-ev li{font-size:11.5px;color:var(--ink-2);line-height:1.45}
        .wp-acts{display:flex;gap:7px;align-items:center;flex-wrap:wrap}
        .wp-qty{display:flex;align-items:center;gap:4px;font-size:11.5px;color:var(--ink-2)}
        .wp-qty input{width:62px;border:1px solid var(--line);border-radius:8px;padding:6px 8px;font-size:12.5px;font-weight:700;background:var(--card);color:var(--ink)}
        .wp-qty em{font-size:11px;color:var(--ink-3);font-style:normal}
        .wp-go{border:none;border-radius:9px;background:var(--cobalt);color:#fff;font-size:11.5px;font-weight:700;padding:8px 13px;cursor:pointer}
        .wp-go:hover{opacity:.88}
        .wp-pass{border:1px solid var(--line);border-radius:9px;background:none;color:var(--ink-2);font-size:11.5px;font-weight:600;padding:8px 12px;cursor:pointer}
        .wp-honest{border:1.5px dashed var(--line);border-radius:11px;padding:14px;font-size:11.5px;color:var(--ink-3)}
        .wp-upload{border:1.5px dashed var(--line);border-radius:11px;padding:16px}
        .wp-up-t{font-size:13px;font-weight:700;color:var(--ink);margin-bottom:4px}
        .wp-upload p{font-size:11.5px;color:var(--ink-2);margin:0 0 10px;line-height:1.5;max-width:560px}
        .wp-up-btns{display:flex;gap:8px;flex-wrap:wrap}
        .wp-msg{margin-top:9px;font-size:11px;color:var(--sage);font-weight:600}
        .wp-msg.err{color:var(--clay)}
        .wp-toast{margin-top:10px;font-size:11.5px;font-weight:600;color:var(--cobalt)}
      ` }} />

      <div className="wp-bar">
        <h2>Plan semanal</h2>
        {ds?.has_sales ? (
          <span className="st">
            ventas hasta {ds.sales_through} · {ds.products} productos · {ds.units} u
            {ds.has_stock ? " · stock cargado" : " · sin stock (subilo para reponer/reducir)"}
          </span>
        ) : (
          <span className="st">reponer · reducir · precio · extender · testear</span>
        )}
      </div>

      {!connected ? (
        <div className="wp-honest">El plan sale de tus ventas reales vía el engine — prendelo y esta franja se llena sola. Sin números no se inventa nada.</div>
      ) : !plan ? (
        <div className="wp-honest">Cargando el plan…</div>
      ) : !plan.data_status?.has_sales ? (
        <Uploader brandId={engine.brandId} onUploaded={refresh} />
      ) : actions.length === 0 ? (
        <div className="wp-honest">
          Sin acciones pendientes esta semana — {plan.actions.length ? "ya decidiste sobre todas" : "los números no piden nada hoy"}.
          {!ds.has_stock && " Subí un CSV de stock y aparecen las de reposición/rebaja."}
        </div>
      ) : (
        <div className="wp-grid">
          {actions.map((a) => (
            <ActionCard key={a.product_key + a.type} a={a} brandId={engine.brandId}
              salesThrough={ds.sales_through} onDone={done} />
          ))}
        </div>
      )}
      {toast && <div className="wp-toast">{toast}</div>}
    </div>
  );
}
