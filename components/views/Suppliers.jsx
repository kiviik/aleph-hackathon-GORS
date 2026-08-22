"use client";
// PROVEEDORES — the brand's factory directory, and the engine's honest read of
// each factory's delivery record.
//
// The engine shipped this whole surface with zero frontend callers
// (suppliers.py): the directory, filterable by what a factory can make, and
// `GET …/performance`, which is DERIVED from the critical-path milestones the
// team already records. Nobody enters a score here, so the number cannot go
// stale and cannot be flattered — and when there is not enough history the
// engine refuses to score and says why. This screen renders that refusal
// verbatim (lib/suppliers.mjs); it never turns a null into "0%".
//
// ⚠ WHAT IS DELIBERATELY NOT HERE: a per-supplier quote list. Quotes are read
// per range row (`/slots/{id}/quotes`) and per garment (`/styles/{id}/quotes`)
// because landed cost and margin are per SEASON — there is no brand-level
// "this factory's quotes" endpoint, and drawing that table from nothing would
// be inventing a comparison the engine refuses to flatten. The rail says so.
//
// ⚠ THREE STATES EVERYWHERE. undefined = not asked · null = could not ask ·
// [] = asked, none. "Sin proveedores" over a 500 is the lie this codebase
// keeps having to remove; it does not get reintroduced here.
import { useCallback, useEffect, useState } from "react";

import { useEngine } from "@/components/EngineProvider";
import { createSupplier, getSupplierPerformance, getSuppliers } from "@/lib/api";
import { SUPPLIER_ATTRIBUTION_UNREADABLE } from "@/lib/criticalPath.mjs";
import { declared, performanceRead, unattributedText } from "@/lib/suppliers.mjs";

const CSS = `
.sup{max-width:1180px;margin:0 auto;padding:26px 30px 80px}
.sup-eyebrow{font-family:var(--d);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--editorial)}
.sup-title{font-family:var(--serif);font-size:34px;font-weight:600;letter-spacing:-.015em;margin:7px 0 5px;color:var(--ink)}
.sup-sub{margin:0 0 20px;color:var(--ink-2);font-size:13.5px;max-width:72ch}

.sup-cols{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:20px;align-items:start}
@media (max-width:960px){.sup-cols{grid-template-columns:1fr}}

.sup-tbl{width:100%;border-collapse:collapse;background:var(--surface);border:1px solid var(--line);border-radius:var(--r);overflow:hidden}
.sup-tbl th{text-align:left;font-family:var(--d);font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3);padding:9px 13px;border-bottom:1px solid var(--line);font-weight:600}
.sup-tbl td{padding:11px 13px;border-bottom:1px solid var(--hair);vertical-align:top;font-size:13px;color:var(--ink)}
.sup-tbl tr:last-child td{border-bottom:0}
.sup-tbl tbody tr{cursor:pointer}
.sup-tbl tbody tr:hover td{background:var(--paper-2)}
.sup-tbl tbody tr.on td{background:var(--action-wash)}
.sup-none{color:var(--ink-3)}
.sup-chip{display:inline-block;font-family:var(--d);font-size:10.5px;padding:2px 7px;border-radius:var(--r-xs);background:var(--paper-2);color:var(--ink-2);margin:1px 3px 1px 0;white-space:nowrap}

.sup-rail{border:1px solid var(--line);border-radius:var(--r);background:var(--surface);padding:16px 18px}
.sup-rail h2{font-family:var(--disp);font-size:16px;font-weight:700;margin:0 0 2px;color:var(--ink)}
.sup-rail .mono{font-family:var(--m,ui-monospace,Menlo,monospace);font-size:11.5px;color:var(--ink-3)}
.sup-dl{margin:12px 0 0;font-size:13px}
.sup-dl dt{font-family:var(--d);font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);margin-top:9px}
.sup-dl dd{margin:2px 0 0;color:var(--ink)}
.sup-h3{font-family:var(--d);font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3);margin:18px 0 6px;border-top:1px solid var(--line);padding-top:14px}
.sup-perf-n{font-family:var(--disp);font-size:24px;font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums}
.sup-note{font-size:12.5px;line-height:1.55;color:var(--ink-2);margin:6px 0 0}
.sup-note.absent{border:1px dashed var(--line);border-radius:var(--r-xs);padding:10px 12px;background:var(--paper)}
.sup-note.warn{border-left:3px solid var(--inferred);background:var(--inferred-wash);border-radius:0 var(--r-xs) var(--r-xs) 0;padding:9px 12px}
.sup-basis{font-size:11px;color:var(--ink-3);margin-top:6px;line-height:1.5}

.sup-empty{border:1px dashed var(--line);border-radius:var(--r);padding:34px;text-align:center;background:var(--surface)}
.sup-empty b{display:block;font-family:var(--disp);font-size:17px;color:var(--ink);margin-bottom:6px}
.sup-empty p{margin:0 auto;max-width:56ch;font-size:13px;line-height:1.6;color:var(--ink-2)}

.sup-add{margin:14px 0 0;border:1px solid var(--line);border-radius:var(--r);background:var(--surface);padding:14px 16px}
.sup-add h3{font-family:var(--disp);font-size:14px;margin:0 0 10px;color:var(--ink)}
.sup-form{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}
.sup-form label{display:block;font-family:var(--d);font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-3)}
.sup-form input{width:100%;font:inherit;font-size:12.5px;padding:6px 8px;margin-top:3px;border:1px solid var(--line);border-radius:var(--r-xs);background:var(--paper);color:var(--ink)}
.sup-err{margin:10px 0 0;font-size:12.5px;color:var(--clay)}
.sup-btn{border:none;border-radius:999px;padding:8px 15px;font-family:var(--d);font-size:12.5px;font-weight:600;cursor:pointer;background:var(--action);color:#fff}
.sup-btn.s{background:var(--paper-2);color:var(--ink);border:1px solid var(--line)}
.sup-btn[disabled]{opacity:.45;cursor:default}
.sup-actions{display:flex;gap:8px;margin-top:12px;align-items:center}
`;

const EMPTY_FORM = {
  name: "", country: "", contact: "", currency: "",
  default_moq_units: "", default_lead_time_days: "",
  categories: "", capabilities: "", certifications: "",
};

const list = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);

export default function Suppliers({ onNavigate }) {
  const engine = useEngine();
  const brandId = engine.brandId || null;

  // undefined = not asked yet · null = could not ask · [] = asked, none.
  const [suppliers, setSuppliers] = useState(undefined);
  const [selectedId, setSelectedId] = useState(null);
  const [perf, setPerf] = useState(undefined);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErr, setFormErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!brandId) return;
    setSuppliers(await getSuppliers(brandId));
  }, [brandId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!brandId || !selectedId) { setPerf(undefined); return; }
    let stale = false;
    setPerf(undefined);
    getSupplierPerformance(brandId, selectedId)
      .then((p) => { if (!stale) setPerf(p); });
    return () => { stale = true; };
  }, [brandId, selectedId]);

  async function submit() {
    setBusy(true); setFormErr(null);
    try {
      const created = await createSupplier(brandId, {
        name: form.name.trim(),
        country: form.country.trim() || null,
        contact: form.contact.trim() || null,
        currency: form.currency.trim() || null,
        default_moq_units: form.default_moq_units === "" ? null : Number(form.default_moq_units),
        default_lead_time_days: form.default_lead_time_days === "" ? null : Number(form.default_lead_time_days),
        categories: list(form.categories),
        capabilities: list(form.capabilities),
        certifications: list(form.certifications),
      });
      setForm(EMPTY_FORM); setAdding(false);
      await load();
      if (created?.id) setSelectedId(created.id);
    } catch (e) {
      // The engine's refusal (a 409 names the duplicate) is the message.
      setFormErr(String(e?.payload?.detail || e?.payload || e?.message || "no se pudo guardar"));
    }
    setBusy(false);
  }

  if (!brandId) {
    return (
      <section className="sup">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="sup-empty"><b>Sin marca activa</b>
          <p>Elegí una marca arriba para ver sus proveedores.</p></div>
      </section>
    );
  }

  const rows = Array.isArray(suppliers) ? suppliers : [];
  const selected = rows.find((s) => s.id === selectedId) || null;
  const field = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <section className="sup">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="sup-eyebrow">Marca &amp; datos · Proveedores</div>
      <h1 className="sup-title">Proveedores</h1>
      <p className="sup-sub">
        Las fábricas con las que trabaja la marca: qué hacen, con qué MOQ y qué
        lead time declaran, y — cuando hay historia suficiente — cómo entregaron
        de verdad. El cumplimiento no se carga a mano: el motor lo deriva de las
        salidas de fábrica registradas en el calendario crítico.
      </p>

      {suppliers === undefined ? (
        <div className="sup-empty"><b>Consultando el motor…</b>
          <p>Todavía no sabemos cuántos proveedores hay. Esto no es un cero.</p></div>
      ) : suppliers === null ? (
        <div className="sup-empty"><b>No pudimos consultar el motor.</b>
          <p>No quiere decir que no haya proveedores — quiere decir que no
             pudimos preguntar. Antes de afirmar que esta marca no tiene
             ninguno, preferimos decirte que la consulta falló.</p></div>
      ) : (
        <div className="sup-cols">
          <div>
            {rows.length === 0 ? (
              <div className="sup-empty"><b>Esta marca todavía no registró proveedores.</b>
                <p>Un proveedor registrado es lo que permite después registrar a
                   quién se le envió cada ficha técnica, compararlo en las
                   cotizaciones y derivar su cumplimiento del calendario.</p></div>
            ) : (
              <table className="sup-tbl">
                <thead><tr>
                  <th>Proveedor</th><th>Hace</th><th>MOQ</th><th>Lead time</th>
                </tr></thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id} className={s.id === selectedId ? "on" : undefined}
                        onClick={() => setSelectedId(s.id === selectedId ? null : s.id)}>
                      <td><b>{s.name}</b>
                        <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                          {s.country || "país sin declarar"}
                          {s.contact ? ` · ${s.contact}` : ""}
                          {s.active === false ? " · inactivo" : ""}
                        </div></td>
                      <td>{(s.categories || []).length
                        ? (s.categories || []).map((c) => <span key={c} className="sup-chip">{c}</span>)
                        : <span className="sup-none">sin declarar</span>}</td>
                      <td>{declared(s.default_moq_units, "u")
                        ?? <span className="sup-none">sin declarar</span>}</td>
                      <td>{declared(s.default_lead_time_days, "d")
                        ?? <span className="sup-none">sin declarar</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {adding ? (
              <div className="sup-add">
                <h3>Registrar un proveedor</h3>
                <div className="sup-form">
                  <label>Nombre *<input value={form.name} onChange={field("name")} autoFocus /></label>
                  <label>País<input value={form.country} onChange={field("country")} /></label>
                  <label>Contacto<input value={form.contact} onChange={field("contact")} /></label>
                  <label>Moneda<input value={form.currency} onChange={field("currency")} placeholder="ARS" /></label>
                  <label>MOQ por defecto<input inputMode="numeric" value={form.default_moq_units} onChange={field("default_moq_units")} /></label>
                  <label>Lead time (días)<input inputMode="numeric" value={form.default_lead_time_days} onChange={field("default_lead_time_days")} /></label>
                  <label>Categorías (coma)<input value={form.categories} onChange={field("categories")} placeholder="Remeras, Buzos" /></label>
                  <label>Capacidades (coma)<input value={form.capabilities} onChange={field("capabilities")} /></label>
                  <label>Certificaciones (coma)<input value={form.certifications} onChange={field("certifications")} placeholder="GOTS" /></label>
                </div>
                {formErr && <p className="sup-err">{formErr}</p>}
                <div className="sup-actions">
                  <button className="sup-btn" disabled={busy || !form.name.trim()} onClick={submit}>
                    Guardar proveedor
                  </button>
                  <button className="sup-btn s" disabled={busy}
                    onClick={() => { setAdding(false); setFormErr(null); }}>Cancelar</button>
                </div>
              </div>
            ) : (
              <div className="sup-actions">
                <button className="sup-btn" onClick={() => setAdding(true)}>Registrar un proveedor</button>
              </div>
            )}
          </div>

          <aside className="sup-rail">
            {!selected ? (
              <p className="sup-note">Elegí un proveedor de la lista para ver su
                detalle y su cumplimiento derivado del calendario.</p>
            ) : (
              <>
                <h2>{selected.name}</h2>
                <div className="mono">{selected.country || "país sin declarar"}
                  {selected.currency ? ` · ${selected.currency}` : ""}</div>
                <dl className="sup-dl">
                  <dt>Contacto</dt>
                  <dd>{selected.contact || <span className="sup-none">sin declarar</span>}</dd>
                  <dt>MOQ por defecto</dt>
                  <dd>{declared(selected.default_moq_units, "unidades")
                    ?? <span className="sup-none">sin declarar</span>}</dd>
                  <dt>Lead time por defecto</dt>
                  <dd>{declared(selected.default_lead_time_days, "días")
                    ?? <span className="sup-none">sin declarar</span>}</dd>
                  <dt>Capacidades</dt>
                  <dd>{(selected.capabilities || []).length
                    ? (selected.capabilities || []).map((c) => <span key={c} className="sup-chip">{c}</span>)
                    : <span className="sup-none">sin declarar</span>}</dd>
                  <dt>Certificaciones</dt>
                  <dd>{(selected.certifications || []).length
                    ? (selected.certifications || []).map((c) => <span key={c} className="sup-chip">{c}</span>)
                    : <span className="sup-none">ninguna declarada</span>}</dd>
                </dl>

                <div className="sup-h3">Cumplimiento · derivado, no cargado</div>
                {(() => {
                  if (perf === undefined) {
                    return <p className="sup-note">Consultando las entregas…</p>;
                  }
                  const read = performanceRead(perf);
                  if (read.state === "unavailable") {
                    return <p className="sup-note absent">No pudimos consultar el
                      cumplimiento. No quiere decir que no exista — la consulta
                      falló.</p>;
                  }
                  const excluded = unattributedText(read.unattributed);
                  if (read.state === "insufficient") {
                    // The engine refused to score, and its own sentence says
                    // why. NEVER a number here — a null is not a 0%. What DOES
                    // belong is the distance to an answer: how many attributed
                    // deliveries exist (a count of deliveries, never a rate),
                    // and how many exist that nobody attributed — because those
                    // two gaps have different fixes and only one of them is
                    // "wait".
                    return (
                      <>
                        <p className="sup-note absent">Sin número todavía: {read.reason}.</p>
                        {/* ⚠ `read.observations` IS DELIBERATELY NOT PRINTED
                            AGAIN HERE. The engine's own sentence above already
                            opens with it ("sólo 0 entrega(s) atribuidas…"), and
                            repeating a count a reader has just read is how a
                            refusal starts to look like a dashboard. It stays on
                            the read for callers that need it. */}
                        {perf?.slots_assigned != null && (
                          <p className="sup-basis">{perf.slots_assigned} posiciones de rango
                            asignadas a este proveedor.</p>
                        )}
                        {excluded && (
                          <p className="sup-note warn">{excluded}</p>
                        )}
                      </>
                    );
                  }
                  return (
                    <>
                      <div className="sup-perf-n">{read.onTimeText} en fecha</div>
                      <p className="sup-note">{read.varianceText} · sobre {read.observations} entregas
                        atribuidas.</p>
                      {excluded && <p className="sup-note warn">{excluded}</p>}
                      {read.basis && <p className="sup-basis">Base: {read.basis}</p>}
                    </>
                  );
                })()}

                <div className="sup-h3">Hitos de esta fábrica</div>
                {/* ⚠ A DECLARED ABSENCE, AND THE ONE ON THIS SCREEN THAT COST
                    THE MOST TO ACCEPT. "¿Esta fábrica está atrasada en algo
                    ahora?" is the right question and the engine cannot be asked
                    it: `critical_path.project` returns key, style_id, label,
                    dates, slip, state, owner, depends_on, blocked_by and why —
                    and no `supplier_id`. There is no other read of the
                    milestone table in the engine.

                    So the only way to draw a list here would be to filter the
                    BRAND's calendar and put it under one factory's name, which
                    is exactly the defect migration 0071 was written to fix
                    (every supplier's deliveries counted toward whichever
                    supplier you asked about). We do not redraw it in the
                    browser. */}
                <p className="sup-note absent">{SUPPLIER_ATTRIBUTION_UNREADABLE}</p>
                <p className="sup-note">
                  Lo que sí es real y accionable es la atribución: cada salida de
                  fábrica del calendario puede asignarse a una fábrica, y es eso
                  lo que convierte una entrega «sin proveedor» en historia de
                  este proveedor.
                </p>
                {onNavigate && (
                  <div className="sup-actions">
                    <button className="sup-btn s" onClick={() => onNavigate("criticalpath")}>
                      Abrir la ruta crítica
                    </button>
                  </div>
                )}

                <div className="sup-h3">Cotizaciones</div>
                {/* A declared absence, not a missing feature drawn anyway: no
                    brand-level per-supplier quote endpoint exists, because
                    landed cost and margin are per SEASON and the engine
                    refuses to flatten them under one factory's name. */}
                <p className="sup-note absent">
                  Las cotizaciones se comparan donde tienen su economía: por
                  fila de rango y por estilo (pestaña Cotizaciones del Estilo).
                  No hay una lista «todas las cotizaciones de esta fábrica» en
                  el motor, y esta pantalla no la inventa.
                </p>
              </>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}
