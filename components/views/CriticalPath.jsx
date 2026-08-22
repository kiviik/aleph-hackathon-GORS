"use client";
// RUTA CRÍTICA — the collection's calendar, and what a slip today does to the drop.
//
// The engine shipped this whole surface with ZERO frontend callers
// (`api/app/routers/milestones.py`, `api/app/critical_path.py`). It runs a
// forward pass over the dates the team recorded: a done milestone is fixed at
// the day it happened, an undone one can never land before today, and nothing
// lands before what it waits on plus the gap the team wrote down. The projected
// launch date falls out of that.
//
// ⚠ WHAT THIS SCREEN IS NOT ALLOWED TO DO, and the reasons are the engine's own:
//
//   · IT DOES NOT DECIDE WHAT IS LATE. `late`, `at_risk`, `on_track`, `done`
//     and `unplanned` arrive computed, each with the `why` sentence that
//     justifies it ("no puede pasar antes del … porque espera a Orden de
//     producción"). A `new Date()` comparison in the browser would be a second
//     opinion nobody could trace, and it would disagree the first time a
//     timezone did.
//   · IT DOES NOT INVENT DURATIONS. `seed` writes twelve milestones with NO
//     dates on purpose — a pre-filled calendar hands a team deadlines nobody
//     agreed to, rendered exactly like the ones they did agree to.
//   · IT DOES NOT DEDUPE. `duplicate_milestones` is rendered as a warning with
//     the fix in it. The engine keeps the first row and names the loser
//     precisely because the old silent collapse could make a style's own
//     ex-factory vanish, or replace the collection's and move everybody's
//     launch.
//   · IT DOES NOT SHOW WHICH FACTORY OWNS A DATE. The projection does not
//     return `supplier_id`, so the attribution is written here and read
//     nowhere — declared in full at the editor, never implied.
//
// Three states everywhere: undefined = not asked · null = could not ask ·
// `milestones: []` = asked, and this collection has no calendar yet (which the
// engine answers in its own sentence, pointing at the seed endpoint).
import { useCallback, useEffect, useMemo, useState } from "react";

import { useCollection } from "@/components/CollectionProvider";
import { useEngine } from "@/components/EngineProvider";
import {
  getCriticalPath, getSuppliers, putMilestone, seedCriticalPath,
} from "@/lib/api";
import {
  SUPPLIER_ATTRIBUTION_UNREADABLE, coverageNotes, editable, hasEdits,
  launchRead, milestonePatch, orderRows, pathRead, scopeOf, slipText,
  stateCounts, stateRead, STATE_ORDER,
} from "@/lib/criticalPath.mjs";

const CSS = `
.crit{max-width:1180px;margin:0 auto;padding:26px 30px 80px}
.crit-eyebrow{font-family:var(--d);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--editorial)}
.crit-title{font-family:var(--serif);font-size:34px;font-weight:600;letter-spacing:-.015em;margin:7px 0 5px;color:var(--ink)}
.crit-sub{margin:0 0 18px;color:var(--ink-2);font-size:13.5px;line-height:1.6;max-width:76ch}

.crit-empty{border:1px dashed var(--line);border-radius:var(--r);padding:34px;text-align:center;background:var(--surface)}
.crit-empty b{display:block;font-family:var(--disp);font-size:17px;color:var(--ink);margin-bottom:6px}
.crit-empty p{margin:0 auto 12px;max-width:60ch;font-size:13px;line-height:1.6;color:var(--ink-2)}

.crit-launch{display:flex;flex-wrap:wrap;gap:18px;align-items:flex-start;border:1px solid var(--line);border-radius:var(--r);background:var(--surface);padding:16px 18px;margin-bottom:14px}
.crit-launch-k{font-family:var(--d);font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3)}
.crit-launch-v{font-family:var(--disp);font-size:26px;font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums;line-height:1.15}
.crit-launch-why{flex:1 1 260px;font-size:12.5px;line-height:1.55;color:var(--ink-2);min-width:0}

.crit-counts{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 14px}
.crit-count{display:inline-flex;gap:6px;align-items:baseline;font-family:var(--d);font-size:11px;padding:4px 9px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--ink-2)}
.crit-count b{font-size:12.5px;color:var(--ink);font-variant-numeric:tabular-nums}

.crit-warn{border-left:3px solid var(--clay);background:var(--clay-wash);border-radius:0 var(--r-xs) var(--r-xs) 0;padding:10px 13px;margin:0 0 10px;font-size:12.5px;line-height:1.55;color:var(--ink)}
.crit-warn b{display:block;font-family:var(--d);font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--clay);margin-bottom:3px}
.crit-note{border:1px dashed var(--line);border-radius:var(--r-xs);background:var(--paper);padding:10px 13px;margin:0 0 10px;font-size:12.5px;line-height:1.55;color:var(--ink-2)}

.crit-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 10px}
.crit-seg{display:inline-flex;border:1px solid var(--line);border-radius:999px;overflow:hidden;background:var(--surface)}
.crit-seg button{border:0;background:transparent;font-family:var(--d);font-size:11.5px;padding:6px 12px;cursor:pointer;color:var(--ink-2)}
.crit-seg button.on{background:var(--action-wash);color:var(--action-ink);font-weight:600}
.crit-order{font-size:11.5px;color:var(--ink-3);line-height:1.5}

.crit-tbl{width:100%;border-collapse:collapse;background:var(--surface);border:1px solid var(--line);border-radius:var(--r);overflow:hidden}
.crit-tbl th{text-align:left;font-family:var(--d);font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3);padding:9px 13px;border-bottom:1px solid var(--line);font-weight:600}
.crit-tbl td{padding:10px 13px;border-bottom:1px solid var(--hair);vertical-align:top;font-size:13px;color:var(--ink)}
.crit-tbl tr.pick{cursor:pointer}
.crit-tbl tr.pick:hover td{background:var(--paper-2)}
.crit-tbl tr.on td{background:var(--action-wash)}
.crit-tbl td.num{font-variant-numeric:tabular-nums;white-space:nowrap}
.crit-key{font-family:var(--d);font-size:10.5px;color:var(--ink-3);display:block;margin-top:2px}
.crit-why{display:block;margin-top:3px;font-size:12px;line-height:1.5;color:var(--ink-2);max-width:52ch}
.crit-none{color:var(--ink-3)}
.crit-scope{display:inline-block;font-family:var(--d);font-size:10px;padding:1px 6px;border-radius:var(--r-xs);background:var(--observed-wash);color:var(--observed-ink);margin-top:3px}

.crit-state{display:inline-flex;align-items:center;gap:5px;font-family:var(--d);font-size:10.5px;padding:2px 8px;border-radius:999px;white-space:nowrap;border:1px solid transparent}
.crit-state.bad{background:var(--clay-wash);color:var(--clay);border-color:var(--clay)}
.crit-state.warn{background:var(--inferred-wash);color:var(--warning);border-color:var(--inferred)}
.crit-state.ok{background:var(--observed-wash);color:var(--observed-ink)}
.crit-state.done{background:var(--paper-2);color:var(--ink-2)}
.crit-state.absent{background:transparent;color:var(--ink-3);border-color:var(--line);border-style:dashed}
.crit-state.unknown{background:transparent;color:var(--ink-2);border-color:var(--hair-2)}

.crit-edit{border:1px solid var(--line);border-top:0;border-radius:0 0 var(--r) var(--r);background:var(--surface);padding:14px 16px;margin:0 0 14px}
.crit-edit h3{font-family:var(--disp);font-size:15px;margin:0 0 3px;color:var(--ink)}
.crit-edit .crit-key{margin-bottom:9px}
.crit-fields{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px}
.crit-fields label{display:block;font-family:var(--d);font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-3)}
.crit-fields input,.crit-fields select{width:100%;font:inherit;font-size:12.5px;padding:6px 8px;margin-top:3px;border:1px solid var(--line);border-radius:var(--r-xs);background:var(--paper);color:var(--ink)}
.crit-hint{font-size:11.5px;line-height:1.5;color:var(--ink-3);margin:8px 0 0}
.crit-err{margin:9px 0 0;font-size:12.5px;color:var(--clay)}
.crit-actions{display:flex;gap:8px;margin-top:12px;align-items:center;flex-wrap:wrap}
.crit-btn{border:none;border-radius:999px;padding:8px 15px;font-family:var(--d);font-size:12.5px;font-weight:600;cursor:pointer;background:var(--action);color:#fff}
.crit-btn.s{background:var(--paper-2);color:var(--ink);border:1px solid var(--line)}
.crit-btn[disabled]{opacity:.45;cursor:default}
.crit-basis{font-size:11.5px;color:var(--ink-3);line-height:1.55;margin:14px 0 0;max-width:80ch}
`;

const dateText = (iso) => iso || null;

function StateChip({ state }) {
  const read = stateRead(state);
  // ⚠ An unrecognised state is SHOWN, raw. A screen that rendered a word it
  // does not know as "En fecha" would be claiming something it never checked.
  if (!read) {
    return <span className="crit-state unknown" title="estado que este build no conoce">{state || "sin estado"}</span>;
  }
  return <span className={`crit-state ${read.tone}`}>{read.label}</span>;
}

function Row({ row, selected, onSelect }) {
  const scope = scopeOf(row);
  const slip = slipText(row.slip_days);
  const can = editable(row);
  return (
    <tr className={`${can.can ? "pick" : ""}${selected ? " on" : ""}`}
        onClick={can.can ? () => onSelect(selected ? null : row) : undefined}>
      <td>
        <b>{row.label || row.key}</b>
        <span className="crit-key">{row.key}</span>
        {scope.scope === "style" && <span className="crit-scope">{scope.label}</span>}
        {row.why && <span className="crit-why">{row.why}</span>}
      </td>
      <td><StateChip state={row.state} /></td>
      <td className="num">{dateText(row.planned_date)
        || <span className="crit-none">sin planificar</span>}</td>
      <td className="num">{dateText(row.actual_date)
        || <span className="crit-none">—</span>}</td>
      <td className="num">{dateText(row.projected_date)
        || <span className="crit-none">no proyectable</span>}</td>
      <td className="num">{slip || <span className="crit-none">sin base</span>}</td>
      <td>{row.owner || <span className="crit-none">sin responsable</span>}</td>
    </tr>
  );
}

export default function CriticalPath() {
  const engine = useEngine();
  const brandId = engine.brandId || null;
  const { activeId: collectionId, active, loading: collectionsLoading } = useCollection();

  // undefined = not asked · null = could not ask · payload = the engine's answer
  const [path, setPath] = useState(undefined);
  const [suppliers, setSuppliers] = useState(undefined);
  const [picked, setPicked] = useState(null);      // the milestone key being edited
  const [edits, setEdits] = useState({});
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState("sequence");

  const load = useCallback(async () => {
    if (!brandId || !collectionId) { setPath(undefined); return; }
    setPath(await getCriticalPath(brandId, collectionId));
  }, [brandId, collectionId]);

  useEffect(() => { setPicked(null); setEdits({}); setErr(null); load(); }, [load]);

  // The factory list is only needed by the attribution control; it is a brand
  // asset and does not depend on the collection.
  useEffect(() => {
    if (!brandId) { setSuppliers(undefined); return; }
    let stale = false;
    getSuppliers(brandId).then((s) => { if (!stale) setSuppliers(s); });
    return () => { stale = true; };
  }, [brandId]);

  const read = useMemo(() => pathRead(path), [path]);
  // Memoised so the identity is stable: a fresh `[]` on every render would make
  // every memo below it recompute, and the row list is what the whole screen
  // derives from.
  const rows = useMemo(() => (read.state === "ready" ? read.rows : []), [read]);
  const ordered = useMemo(() => orderRows(rows, order), [rows, order]);
  const counts = useMemo(() => stateCounts(rows), [rows]);
  const notes = useMemo(() => coverageNotes(read), [read]);
  const launch = useMemo(() => launchRead(read), [read]);
  const current = picked ? rows.find((r) => r.key === picked && !r.style_id) || null : null;

  async function save() {
    if (!current) return;
    const body = milestonePatch(edits);
    if (!hasEdits(body)) return;
    setBusy(true); setErr(null);
    try {
      // The PUT returns the WHOLE re-projected calendar — entering a proto date
      // is interesting because of what it does to ex-factory, so the answer is
      // the new calendar, not the row that was written.
      const next = await putMilestone(brandId, collectionId, current.key, body);
      setPath(next);
      setEdits({}); setPicked(null);
    } catch (e) {
      setErr(String(e?.payload?.detail || e?.payload || e?.message || "no se pudo guardar"));
    }
    setBusy(false);
  }

  async function seed() {
    setBusy(true); setErr(null);
    try {
      const out = await seedCriticalPath(brandId, collectionId);
      setPath(out?.path || null);
    } catch (e) {
      setErr(String(e?.payload?.detail || e?.payload || e?.message || "no se pudo crear el calendario"));
    }
    setBusy(false);
  }

  if (!brandId) {
    return (
      <section className="crit">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="crit-empty"><b>Sin marca activa</b>
          <p>Elegí una marca arriba para ver su calendario.</p></div>
      </section>
    );
  }

  const header = (
    <>
      <div className="crit-eyebrow">Colección · Revisión y salida</div>
      <h1 className="crit-title">Ruta crítica</h1>
      <p className="crit-sub">
        El calendario de {active?.name || "esta colección"}: qué se aprobó, qué
        falta y qué le hace un atraso de hoy a la fecha de salida. El motor no
        pronostica — hace aritmética sobre las fechas que el equipo cargó, y por
        eso cada estado viene con la frase que lo justifica.
      </p>
    </>
  );

  if (collectionsLoading || (!collectionId && path === undefined)) {
    return (
      <section className="crit">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        {header}
        <div className="crit-empty"><b>{collectionsLoading ? "Buscando colecciones…" : "Sin colección elegida"}</b>
          <p>{collectionsLoading
            ? "Todavía no sabemos qué colección está activa. Esto no es un calendario vacío."
            : "Elegí una colección arriba: una ruta crítica pertenece a una colección, no a la marca."}</p></div>
      </section>
    );
  }

  return (
    <section className="crit">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {header}

      {read.state === "loading" ? (
        <div className="crit-empty"><b>Consultando el motor…</b>
          <p>Todavía no sabemos si esta colección tiene calendario. Esto no es un cero.</p></div>
      ) : read.state === "unavailable" ? (
        <div className="crit-empty"><b>No pudimos consultar el calendario.</b>
          <p>No quiere decir que no haya hitos — quiere decir que no pudimos
             preguntar. Antes de afirmar que esta colección no tiene fechas,
             preferimos decirte que la consulta falló.</p></div>
      ) : read.state === "unseeded" ? (
        <div className="crit-empty"><b>Esta colección todavía no tiene calendario.</b>
          <p>{read.basis}</p>
          <p>Los doce hitos se crean <b>sin fechas</b>, a propósito: un calendario
             pre-llenado le entrega al equipo doce deadlines que nadie acordó,
             dibujados igual que los que sí acordó.</p>
          <div className="crit-actions" style={{ justifyContent: "center" }}>
            <button className="crit-btn" disabled={busy} onClick={seed}>
              Crear los doce hitos, sin fechas
            </button>
          </div>
          {err && <p className="crit-err">{err}</p>}
        </div>
      ) : (
        <>
          <div className="crit-launch">
            <div>
              <div className="crit-launch-k">Lanzamiento proyectado</div>
              <div className="crit-launch-v">
                {launch.known
                  ? (launch.projectedDate || "no proyectable")
                  : "sin proyectar"}
              </div>
              {launch.known && <StateChip state={launch.state} />}
            </div>
            {launch.known && (
              <div>
                <div className="crit-launch-k">Planificado</div>
                <div className="crit-launch-v">
                  {launch.plannedDate || <span className="crit-none" style={{ fontSize: 15 }}>sin planificar</span>}
                </div>
              </div>
            )}
            <p className="crit-launch-why">
              {launch.known ? (launch.slip ? `${launch.slip}. ` : "") : ""}
              {launch.known ? launch.why : launch.why}
            </p>
          </div>

          {/* Counted from the engine's own `state`, never from a date compared
              here. An unknown state still gets a chip, under its raw key. */}
          <div className="crit-counts">
            {STATE_ORDER.filter((k) => counts[k]).map((k) => (
              <span key={k} className="crit-count">
                <b>{counts[k]}</b> {stateRead(k)?.label || k}
              </span>
            ))}
            {Object.keys(counts).filter((k) => !STATE_ORDER.includes(k)).map((k) => (
              <span key={k} className="crit-count"><b>{counts[k]}</b> {k}</span>
            ))}
          </div>

          {/* ⚠ SURFACED, NEVER DEDUPED. The engine keeps the first row and names
              the rest; a screen that dropped the name would restore the silent
              collapse that could make a style's ex-factory disappear. */}
          {read.duplicates.map((d) => (
            <div key={`${d.key}:${d.styleId || "col"}`} className="crit-warn">
              <b>Hito duplicado</b>{d.text}
            </div>
          ))}

          {notes.map((n) => <p key={n.kind} className="crit-note">{n.text}</p>)}

          <div className="crit-bar">
            <div className="crit-seg">
              <button className={order === "sequence" ? "on" : undefined}
                      onClick={() => setOrder("sequence")}>Secuencia</button>
              <button className={order === "date" ? "on" : undefined}
                      onClick={() => setOrder("date")}>Por fecha</button>
            </div>
            <span className="crit-order">
              {order === "sequence"
                ? "El orden del motor: la secuencia de dependencias, con la excepción de un estilo justo debajo de la fila que reemplaza."
                : "Ordenado por la fecha PROYECTADA que calculó el motor. Un hito que no se pudo proyectar va al final, sin fecha inventada."}
            </span>
          </div>

          <table className="crit-tbl">
            <thead><tr>
              <th>Hito</th><th>Estado</th><th>Planificado</th><th>Real</th>
              <th>Proyectado</th><th>Desvío</th><th>Responsable</th>
            </tr></thead>
            <tbody>
              {ordered.map((row) => (
                <Row key={`${row.key}:${row.style_id || "col"}`} row={row}
                     selected={!row.style_id && row.key === picked}
                     onSelect={(r) => {
                       setErr(null); setEdits({});
                       setPicked(r ? r.key : null);
                     }} />
              ))}
            </tbody>
          </table>

          {current && <Editor row={current} suppliers={suppliers} edits={edits}
                              setEdits={setEdits} onSave={save} busy={busy} err={err}
                              onCancel={() => { setPicked(null); setEdits({}); setErr(null); }} />}

          {/* A style overlay is read-only here and the reason is stated where a
              reader would otherwise try to click it. */}
          {rows.some((r) => r.style_id) && (
            <p className="crit-note">{editable({ key: "x", style_id: "s" }).why}.</p>
          )}

          <p className="crit-basis">Base: {read.basis}</p>
        </>
      )}
    </section>
  );
}

function Editor({ row, suppliers, edits, setEdits, onSave, onCancel, busy, err }) {
  const set = (k) => (e) => setEdits((s) => ({ ...s, [k]: e.target.value }));
  const value = (k, fallback) => (k in edits ? edits[k] : (fallback || ""));
  const body = milestonePatch(edits);
  // Attribution is only meaningful on the milestone the supplier answers for:
  // `ex_factory` is the one `GET /suppliers/{id}/performance` counts.
  const attributable = row.key === "ex_factory";
  const supplierList = Array.isArray(suppliers) ? suppliers : [];

  return (
    <div className="crit-edit">
      <h3>{row.label || row.key}</h3>
      <span className="crit-key">{row.key} · calendario de la colección</span>

      <div className="crit-fields">
        <label>Fecha planificada
          <input type="date" value={value("plannedDate", row.planned_date)}
                 onChange={set("plannedDate")} /></label>
        <label>Fecha real (ocurrió)
          <input type="date" value={value("actualDate", row.actual_date)}
                 onChange={set("actualDate")} /></label>
        <label>Responsable
          <input value={value("owner", row.owner)} onChange={set("owner")}
                 placeholder="sin responsable" /></label>
      </div>

      <p className="crit-hint">
        El estado no se carga: se deriva. Un hito con fecha real es «Hecho»; sin
        ella, el motor lo proyecta contra hoy y contra lo que espera, y decide si
        está atrasado, en riesgo o en fecha. Vaciar un campo lo borra.
      </p>

      {attributable && (
        <>
          <div className="crit-fields" style={{ marginTop: 10 }}>
            <label>Atribuir esta salida de fábrica a
              <select value={value("supplierId", "")} onChange={set("supplierId")}>
                <option value="">— no cambiar —</option>
                {supplierList.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="crit-hint">
            ⚠ Esto se escribe y no se puede leer de vuelta. {SUPPLIER_ATTRIBUTION_UNREADABLE}
            {" "}Elegir una fábrica acá reemplaza la que hubiera, sin que esta
            pantalla pueda mostrarte cuál era. Lo que sí se ve después es el
            efecto: en Proveedores, esta entrega deja de contarse como «sin
            proveedor asignado».
            {suppliers === null && " (No pudimos leer la lista de proveedores.)"}
            {Array.isArray(suppliers) && suppliers.length === 0
              && " (Esta marca todavía no registró proveedores.)"}
          </p>
        </>
      )}

      {err && <p className="crit-err">{err}</p>}
      <div className="crit-actions">
        <button className="crit-btn" disabled={busy || !hasEdits(body)} onClick={onSave}>
          Guardar y reproyectar
        </button>
        <button className="crit-btn s" disabled={busy} onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}
