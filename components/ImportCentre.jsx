"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBrandId } from "@/components/EngineProvider";
import {
  KIND_LABELS,
  awaitingConfirmation,
  confirmBlockers,
  confirmImport,
  createImport,
  discardImport,
  getImport,
  getImportKinds,
  listImports,
  mappingRows,
  reinterpretImport,
  resultLine,
  statusLine,
} from "@/lib/imports";

// The Import Centre.
//
// The screen's whole job is to make the chain visible and to keep the user in
// it: a file that has been read is NOT a file that has been imported, and the
// only thing standing between the two is the button at the bottom of the
// preview. Everything here is arranged around that gap —
//
//   · the preview panel says "nada se incorporó todavía" in the same breath as
//     the row count, because a row count reads like a success;
//   · every mapped field shows HOW it was matched, and a resemblance match is
//     visually distinct from an exact one — it is the one that is wrong;
//   · columns we could not map are LISTED, with real values from the file, so
//     "we ignored your Sucursal column" is something the user reads rather
//     than discovers a month later;
//   · a blocking question (currency) disables Confirm and says why.
//
// Nothing here decides anything on the brand's behalf. The engine refuses the
// same things independently (api/app/routers/imports.py) — this screen only
// avoids asking for a refusal it can already see coming.
//
// ------------------------------------------------------------------------
// 2026-08-13 PRESENTATION REDESIGN (owner review). The verdict was that this
// read as "a developer made a file uploader and styled the container", and the
// specific tells were all true:
//
//   · the native "Choose File / no file selected" control — now a designed drop
//     zone over a visually-hidden <input type=file> (see `.dc-file-input`);
//   · five near-identical kind boxes — now one select;
//   · the pending-file count sat at the bottom, far from the upload area — it
//     now rides ON the drop zone, where the decision is;
//   · the unsupported-kinds warning outweighed the action — it is a <details>
//     footnote now. Still on the page: it is a real limitation, and the DOM
//     test asserts the reason is readable;
//   · no visual workflow — the engine's own `steps` are now a stepper.
//
// ⚠ NOTHING ABOUT THE SAFETY PROPERTY MOVED. Same calls, same order, same
// blockers, same questions, same two-button confirm/discard. `confirmImport`
// is still the only call that writes, and it is still reachable only with an
// empty `confirmBlockers`. The redesign is markup and CSS.
//
// ⚠ WHAT WAS ASKED FOR AND IS NOT HERE. The review sketched a six-step
// workspace ending in "data quality checked". The engine reports FIVE steps
// (`_steps`, routers/imports.py) and no quality stage. Rendering a sixth would
// be a stage the server never ran — the exact self-filling progress bar that
// `lib/imports.mjs` exists to prevent. The quality signals we DO have
// (warnings, unmapped columns, blocking questions) are counted honestly in the
// exceptions strip above the mapping table instead.

const ACCEPT = ".csv,.tsv,.txt,.xlsx,.xlsm";

const int = (n) => new Intl.NumberFormat("es-AR").format(n || 0);

/** The chain step a person is standing on: the first one not yet done. */
function currentStep(steps = []) {
  const i = steps.findIndex((s) => !s.done);
  return i === -1 ? -1 : i;
}

/**
 * A real sample value for a mapped field, or null.
 *
 * ⚠ ENGINE GAP, NOT A DESIGN CHOICE. The review asked for a Sample column, and
 * the honest source for one would be the raw value of the SOURCE column. The
 * API does not carry it: `unmapped_columns[].sample` has raw samples for the
 * columns we did NOT map, and `sample` has the parsed preview rows — which are
 * keyed by the parser's OUTPUT names, not by the mapping's field names. They
 * overlap only partly (sales maps `sku`→`product_key`, `date`→`sold_on`), so
 * for those fields there is nothing to show.
 *
 * So this returns a value when the payload actually contains one and null when
 * it does not. It never falls back to the source column's header, and never
 * borrows a neighbouring row's value: an invented sample in a mapping preview
 * is the single worst thing this screen could print, because the sample is the
 * evidence the person is confirming against.
 */
function sampleFor(sample, field) {
  for (const row of sample || []) {
    const v = row?.[field];
    if (v != null && String(v).trim() !== "") return String(v);
  }
  return null;
}

/** How a mapping was arrived at, as a status a person can act on. */
function mapStatus(how) {
  switch (how) {
    case "exacta": return { tone: "ok", label: "Confirmado" };
    case "elegida": return { tone: "info", label: "Elegida por vos" };
    case "parecido": return { tone: "warn", label: "Revisar", glyph: "!" };
    case "modelo": return { tone: "warn", label: "Revisar", glyph: "!" };
    default: return { tone: "neutral", label: how || "—" };
  }
}

function Chip({ tone, glyph, children, title }) {
  return (
    <span className={`dc-chip ${tone}`} title={title}>
      {glyph && <span className="g" aria-hidden>{glyph}</span>}
      {children}
    </span>
  );
}

// The engine's own steps, numbered. Labels and details come from the server so
// the stepper cannot describe a stage differently from the thing that ran it.
function Steps({ steps }) {
  const now = currentStep(steps);
  return (
    <ol className="dc-steps">
      {steps.map((s, i) => (
        <li key={s.key}
            className={`dc-step ${s.done ? "done" : ""} ${i === now ? "now" : ""}`}>
          <span className="dc-step-n">
            {s.done ? "✓" : String(i + 1).padStart(2, "0")}
          </span>
          <b>{s.label}</b>
          {s.detail && <span>{s.detail}</span>}
        </li>
      ))}
    </ol>
  );
}

/**
 * The essential surface. One table for every column in the file: the ones we
 * mapped, the required ones we could not find, and the ones we are ignoring.
 *
 * Putting the unmapped columns in the SAME table is the point. They used to be
 * a bulleted list under it, which is where a reader stops reading — and "we
 * did not import your Sucursal column" is exactly the sentence that must not
 * be missed. Here it is a row with a status, like every other column.
 */
function MappingTable({ imp, override, onChange }) {
  const rows = useMemo(() => mappingRows(imp.mapping), [imp.mapping]);
  const headers = (imp.headers || []).filter(Boolean);
  const missing = imp.missing_required || [];
  const unmapped = imp.unmapped_columns || [];

  // The field universe, taken from what the server already named. Never a
  // hand-written list: a field this build invented would be offered to the
  // user and then refused by the engine.
  const fields = [
    ...rows.map((r) => ({ field: r.field, label: r.label })),
    ...missing.map((f) => ({ field: f.field, label: f.label })),
  ];

  return (
    <div className="dc-scroll">
      <table className="dc-table">
        <thead>
          <tr>
            <th scope="col">Columna de tu archivo</th>
            <th scope="col">Campo de Atelier</th>
            <th scope="col">Ejemplo</th>
            <th scope="col">Estado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const st = mapStatus(r.how);
            const value = sampleFor(imp.sample, r.field);
            return (
              <tr key={r.field}>
                <td className="dc-src">{r.column || "—"}</td>
                <td>
                  {r.label}
                  {r.required && <span className="dc-req-tag">obligatorio</span>}
                  <br />
                  <select
                    aria-label={`Columna para ${r.label}`}
                    value={override[r.field] ?? r.column ?? ""}
                    onChange={(e) => onChange(r.field, e.target.value || null)}>
                    <option value="">— sin mapear —</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </td>
                {/* Blank rather than borrowed. See `sampleFor`. */}
                <td className={`dc-sample ${value == null ? "none" : ""}`}
                    title={value == null
                      ? "El motor no devuelve un valor de ejemplo para este campo"
                      : value}>
                  {value == null ? "—" : value}
                </td>
                <td><Chip tone={st.tone} glyph={st.glyph}>{st.label}</Chip></td>
              </tr>
            );
          })}

          {missing.map((f) => (
            <tr key={f.field} className="blocked">
              <td className="dc-src">— no se encontró —</td>
              <td>
                {f.label}
                <span className="dc-req-tag">obligatorio</span>
                <br />
                <select aria-label={`Columna para ${f.label}`} value=""
                  onChange={(e) => onChange(f.field, e.target.value || null)}>
                  <option value="">— elegí una columna —</option>
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </td>
              <td className="dc-sample none">—</td>
              <td><Chip tone="bad" glyph="✕">Falta</Chip></td>
            </tr>
          ))}

          {unmapped.map((u) => (
            <tr key={`u-${u.column}`}>
              <td className="dc-src">{u.column}</td>
              <td>
                <select aria-label={`Campo de Atelier para ${u.column}`} value=""
                  onChange={(e) => e.target.value && onChange(e.target.value, u.column)}>
                  <option value="">— no se importa —</option>
                  {fields.map((f) => (
                    <option key={f.field} value={f.field}>{f.label}</option>
                  ))}
                </select>
              </td>
              {/* These samples ARE raw values from the file — the engine sends
                  them for unmapped columns specifically so this row can prove
                  what is being left behind. */}
              <td className="dc-sample" title={(u.sample || []).join(" / ")}>
                {u.sample?.length ? u.sample.join(" / ") : "—"}
              </td>
              <td><Chip tone="neutral" title="No se importa ningún dato de esta columna">
                Se ignora
              </Chip></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SampleRows({ sample }) {
  if (!sample?.length) return null;
  const cols = Object.keys(sample[0]);
  return (
    <div className="dc-scroll">
      <table className="dc-table">
        <thead>
          <tr>{cols.map((c) => <th key={c} scope="col">{c}</th>)}</tr>
        </thead>
        <tbody>
          {sample.map((r, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c} className={r[c] == null ? "dc-cell-quiet" : ""}>
                  {r[c] == null ? "—" : String(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ImportCentre() {
  const brandId = useBrandId();
  const [kinds, setKinds] = useState(null);
  const [kind, setKind] = useState("ventas");
  const [imports, setImports] = useState([]);
  const [active, setActive] = useState(null);       // the open preview
  const [override, setOverride] = useState({});
  const [answers, setAnswers] = useState({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);          // a file is hovering the zone
  const fileRef = useRef(null);

  const refresh = useCallback(async () => {
    if (!brandId) return;
    try {
      const body = await listImports(brandId);
      setImports(body.imports || []);
    } catch (e) { setError(e.message); }
  }, [brandId]);

  useEffect(() => {
    if (!brandId) return;
    getImportKinds(brandId).then(setKinds).catch(() => setKinds(null));
    refresh();
  }, [brandId, refresh]);

  async function onFile(file) {
    if (!file || !brandId) return;
    setError(""); setBusy("Leyendo el archivo…"); setOverride({}); setAnswers({});
    try {
      const imp = await createImport(brandId, kind, file);
      setActive(imp);
      await refresh();
    } catch (e) { setError(e.message); }
    finally { setBusy(""); if (fileRef.current) fileRef.current.value = ""; }
  }

  // Drag-and-drop is the same entry point as the picker — one `onFile`, so a
  // dropped file cannot skip a check the picked one goes through.
  function onDrop(e) {
    e.preventDefault();
    setOver(false);
    if (busy) return;
    onFile(e.dataTransfer?.files?.[0]);
  }

  async function onRemap(field, column) {
    const next = { ...override, [field]: column };
    setOverride(next);
    setBusy("Releyendo el archivo con ese mapeo…");
    setError("");
    try {
      setActive(await reinterpretImport(brandId, active.id, {
        mapping: next, currency: answers.currency || null,
        numberFormat: answers.number_format || null,
      }));
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }

  async function onConfirm() {
    setBusy("Incorporando…"); setError("");
    try {
      const done = await confirmImport(brandId, active.id, {
        mapping: override, currency: answers.currency || null,
        numberFormat: answers.number_format || null, answers,
      });
      setActive(done);
      await refresh();
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }

  async function open(id) {
    setError(""); setOverride({}); setAnswers({}); setBusy("Abriendo…");
    try { setActive(await getImport(brandId, id)); }
    catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }

  async function onDiscard() {
    setBusy("Descartando…");
    try {
      await discardImport(brandId, active.id);
      setActive(null);
      await refresh();
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }

  const blockers = active ? confirmBlockers(active, answers) : [];
  const waiting = awaitingConfirmation(imports);
  const firstWaiting = imports.find((i) => i.status === "interpreted");

  const kindList = (kinds?.kinds
    || Object.keys(KIND_LABELS).map((k) => ({ kind: k, label: KIND_LABELS[k] })));
  const selected = kindList.find((k) => k.kind === kind);

  // The exceptions count, from what the server actually reported. Three real
  // sources, added up — never a score.
  const nExceptions = active
    ? (active.questions?.length || 0)
      + (active.unmapped_columns?.length || 0)
      + (active.warnings?.length || 0)
      + (active.missing_required?.length || 0)
    : 0;

  if (!brandId) {
    return (
      <div className="dc-empty">
        No hay ninguna marca seleccionada, así que no hay dónde importar. Elegí
        una marca en la barra superior.
      </div>
    );
  }

  return (
    <div className="imp dc">
      <div className="dc-sect-head">
        <div>
          <h2>Importar archivos</h2>
          <p>
            Tus archivos, tal como los exporta tu sistema. Cada uno pasa por la
            misma cadena y <b>nada se incorpora hasta que vos confirmás cómo se
            leyeron las columnas</b>.
          </p>
        </div>
      </div>

      <div className="dc-kindbar">
        <label htmlFor="dc-kind">Qué estás subiendo</label>
        <select id="dc-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          {kindList.map((k) => (
            <option key={k.kind} value={k.kind}>{k.label}</option>
          ))}
        </select>
        {!!selected?.required?.length && (
          <span className="dc-req">
            necesita {selected.required.map((r) => r.label).join(", ")}
          </span>
        )}
      </div>

      {/* ⚠ THE NATIVE FILE CONTROL IS GONE, NOT HIDDEN BEHIND A FAKE ONE. The
          <input> is still the thing that opens the picker and still fires the
          change event; it is visually hidden (clip-path, not display:none) so
          it keeps its accessible name and stays keyboard-reachable, and the
          <label> wrapping it makes the whole zone the hit area. */}
      <label className={`dc-drop ${over ? "over" : ""} ${busy ? "busy" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}>
        <input ref={fileRef} className="dc-file-input" type="file" accept={ACCEPT}
          aria-label={`Elegir archivo de ${selected?.label || KIND_LABELS[kind] || kind}`}
          onChange={(e) => onFile(e.target.files?.[0])} />
        <b>Arrastrá acá tu archivo de {(selected?.label || KIND_LABELS[kind] || kind).toLowerCase()}</b>
        <span className="dc-drop-formats">
          {(kinds?.formats || ["CSV (, o ;)", "TSV", "XLSX"]).join(" · ")}
        </span>
        <span className="dc-drop-promise">
          Nada se incorpora hasta que apruebes el mapeo.
        </span>
        <span className="dc-drop-sub">
          Se lee y se te muestra columna por columna. Podés corregir cualquier
          campo antes de confirmar, y descartarlo sin que quede nada.
        </span>
        <span className="dc-drop-cta">Elegir un archivo</span>
      </label>

      {/* The pending count sits ON the upload area now. It used to live at the
          bottom of the page, which is where the person is not looking when
          they are about to upload a second copy of the same file. */}
      {waiting > 0 && (
        <div className="dc-pending">
          <b>{waiting} archivo{waiting === 1 ? "" : "s"} esperando tu confirmación</b>
          {firstWaiting && (
            <>
              <span className="dc-cell-quiet">·</span>
              <button type="button" onClick={() => open(firstWaiting.id)}>
                Revisar {firstWaiting.filename || "el archivo"}
              </button>
            </>
          )}
        </div>
      )}

      {busy && <div className="dc-busy">{busy}</div>}
      {error && <div className="dc-err">{error}</div>}

      {active && (
        <section className="dc-panel">
          <div className="dc-panel-head">
            <div>
              <h3>{active.filename || "archivo"} · {active.label}</h3>
              <p className="dc-sub">{statusLine(active)}</p>
            </div>
            <div className="dc-row" style={{ display: "flex", gap: "var(--s2)" }}>
              {active.row_count != null && (
                <Chip tone="neutral">
                  <span data-num>{int(active.row_count)}</span>&nbsp;fila(s) legibles
                </Chip>
              )}
              {!!active.skipped_rows && (
                <Chip tone="warn" glyph="!">
                  <span data-num>{int(active.skipped_rows)}</span>&nbsp;salteada(s)
                </Chip>
              )}
            </div>
          </div>

          <Steps steps={active.steps || []} />

          {active.status === "unreadable" ? (
            <div className="dc-err">{active.error}</div>
          ) : (
            <>
              {!!active.questions?.length && (
                <div className="dc-block">
                  <h4>Preguntas abiertas</h4>
                  {active.questions.map((q) => (
                    <div key={q.id} className={`dc-q ${q.blocking ? "blocking" : ""}`}>
                      <b>{q.question}</b>
                      <p>{q.why}</p>
                      {q.id === "currency" && (
                        <select aria-label="Moneda" value={answers.currency || ""}
                          onChange={(e) => setAnswers({ ...answers, currency: e.target.value })}>
                          <option value="">— elegí la moneda —</option>
                          {(q.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      )}
                      {q.id === "number_format" && (
                        <select aria-label="Formato de números"
                          value={answers.number_format || ""}
                          onChange={(e) => setAnswers({ ...answers, number_format: e.target.value })}>
                          <option value="">— elegí cómo se leen los importes —</option>
                          {(q.options || []).map((o) => (
                            <option key={o} value={o}>{q.option_labels?.[o] || o}</option>
                          ))}
                        </select>
                      )}
                      {/* The collection a range plan or a costing file belongs
                          to. It needs its own control for a reason: the generic
                          fallback below answers a blocking question with the
                          string "si", and "si" is not a collection — the engine
                          would refuse it, correctly and uselessly. */}
                      {q.id === "collection" && (
                        (q.options || []).length ? (
                          <select aria-label="Colección" value={answers.collection || ""}
                            onChange={(e) => setAnswers({ ...answers, collection: e.target.value })}>
                            <option value="">— elegí la colección —</option>
                            {(q.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <p className="dc-note">
                            Esta marca todavía no tiene ninguna colección. Creá una
                            antes de importar el plan — el archivo está bien, no hay
                            todavía a dónde ponerlo.
                          </p>
                        )
                      )}
                      {!["currency", "number_format", "collection"].includes(q.id) && q.blocking && (
                        <button type="button" className="dc-btn"
                          onClick={() => setAnswers({ ...answers, [q.id]: "si" })}>
                          {answers[q.id] ? "Confirmado" : "Sí, usalo así"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="dc-block">
                <div className="dc-panel-head">
                  <h4>Cómo se leyeron tus columnas</h4>
                  {nExceptions > 0 && (
                    <Chip tone="warn" glyph="!"
                      title="Preguntas abiertas, campos faltantes, columnas ignoradas y avisos">
                      <span data-num>{int(nExceptions)}</span>&nbsp;cosa(s) para revisar
                    </Chip>
                  )}
                </div>
                <MappingTable imp={active} override={override} onChange={onRemap} />
              </div>

              <div className="dc-block">
                <h4>Primeras filas, como quedarían</h4>
                <SampleRows sample={active.sample} />
              </div>

              {(!!active.warnings?.length || !!active.notes?.length) && (
                <div className="dc-block">
                  <h4>Avisos</h4>
                  {!!active.warnings?.length && (
                    <ul className="dc-list">
                      {active.warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  )}
                  {!!active.notes?.length && (
                    <ul className="dc-list quiet">
                      {active.notes.map((n, i) => <li key={i}>{n}</li>)}
                    </ul>
                  )}
                </div>
              )}

              {active.status === "incorporated" ? (
                <div className="dc-done">
                  Incorporado. {resultLine(active.result)}
                  {active.confirmed_by
                    ? ` · confirmado por ${active.confirmed_by}${active.confirmed_verified ? "" : " (sesión sin autenticar)"}`
                    : " · confirmado por una sesión sin identificar"}
                </div>
              ) : (
                <div className="dc-actions">
                  {!!blockers.length && (
                    <ul className="dc-list bad">
                      {blockers.map((b, i) => <li key={i}>{b}</li>)}
                    </ul>
                  )}
                  <div className="dc-row">
                    <button type="button" className="dc-btn primary"
                      disabled={!!blockers.length || !!busy} onClick={onConfirm}>
                      Confirmar el mapeo e incorporar
                    </button>
                    <button type="button" className="dc-btn" disabled={!!busy}
                      onClick={onDiscard}>
                      Descartar
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}

      <div className="dc-block">
        <h4>Archivos de esta marca</h4>
        {imports.length === 0 ? (
          <p className="dc-empty">Todavía no subiste ningún archivo.</p>
        ) : (
          <div className="dc-scroll">
            <table className="dc-table">
              <thead>
                <tr>
                  <th scope="col">Archivo</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Estado</th>
                  <th scope="col"></th>
                </tr>
              </thead>
              <tbody>
                {imports.map((i) => (
                  <tr key={i.id}>
                    <td className="dc-src">{i.filename || "archivo"}</td>
                    <td>{i.label}</td>
                    <td>{statusLine(i)}</td>
                    <td>
                      {/* The list rows are summaries; the panel needs the full
                          interpretation, so open() re-fetches rather than
                          rendering a half-populated preview with empty mapping
                          tables. */}
                      <button type="button" className="dc-tbtn"
                        onClick={() => open(i.id)}>
                        {i.status === "interpreted" ? "Revisar" : "Ver"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Named out loud rather than omitted: a centre that quietly lacks the
          brand deck looks like one that does not know it exists.
          ⚠ DEMOTED, NOT DELETED. As a bordered warning block this outweighed
          the upload button — the review's point. As a <details> the sentence is
          still in the DOM and one click away. */}
      {!!kinds?.not_yet?.length && (
        <details className="dc-foot">
          <summary>
            {kinds.not_yet.length} tipo(s) de archivo que todavía no se pueden
            importar acá
          </summary>
          <ul>
            {kinds.not_yet.map((n) => (
              <li key={n.kind}><b>{n.label}</b> — {n.why}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
