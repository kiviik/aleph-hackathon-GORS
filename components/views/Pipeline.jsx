"use client";
import { useCallback, useEffect, useState } from "react";
import { BOARD, BOARD_ORDER } from "@/lib/data";
import Thumbnail from "@/components/Thumbnail";
import { useEngine, useBrandId } from "@/components/EngineProvider";
import { readScoped, writeScoped } from "@/lib/brandStore";
import { countLegacyBets, getBets, getSalesProducts, postBetEvent } from "@/lib/api";

// Real development pipeline, designed as a visual board: cards are things the
// owner actually decided on (accepted in Proposals), image-led because the
// people moving them think in garments, not rows.
//
// SOURCE OF TRUTH (2026-07-22 audit): with the engine live, cards are
// product_bets — the permanent object each accept births server-side — and
// every move appends a bet_event. localStorage is only the offline/demo
// fallback, and the chip says which world you're in. A cleared browser can no
// longer lose the board.
const ACCEPTED_KEY = "atelier-accepted";      // legacy/off-line: written by Feed on accept
const PIPE_KEY = "atelier-pipeline";          // legacy/off-line stage state

const STAGES = ["Decidido", "En diseño", "Muestra", "Producción", "En tienda"];
// UI stage <-> engine bet status / event kind (the engine speaks the board's
// words — routers/bets.py uses this same vocabulary).
const STAGE_TO_KIND = { "Decidido": "decidido", "En diseño": "diseno", "Muestra": "muestra", "Producción": "produccion", "En tienda": "tienda" };
const KIND_TO_STAGE = Object.fromEntries(Object.entries(STAGE_TO_KIND).map(([s, k]) => [k, s]));
const DROP_REASONS = ["Cambió la prioridad", "Muy caro producir", "Perdimos la ventana", "Ya no encaja"];
const STUCK_DAYS = 14;

const daysSince = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; }
  catch { return fallback; }
}

// One engine bet -> one board card. Last stage-ish event timestamps the age.
function cardFromBet(bet) {
  const ev = bet.evidence || {};
  const stageEvents = (bet.events || []).filter((e) => e.kind === "created" || KIND_TO_STAGE[e.kind]);
  const last = stageEvents[stageEvents.length - 1];
  const bajada = (bet.events || []).filter((e) => e.kind === "bajada").pop();
  return {
    key: bet.id,
    title: bet.title,
    cat: ev.cat || ev.category || ev.garment || "",
    qty: bet.target_qty,
    trend: typeof ev.trend === "string" ? ev.trend : ev.trend?.name,
    color: ev.color, fabric: ev.fabric, image: ev.image,
    stage: KIND_TO_STAGE[bet.status] || "Decidido",
    lastAt: last?.at || bet.created_at,
    dropped: bet.status === "bajada",
    dropReason: bajada?.payload?.reason || null,
    outcome: bet.outcome || null,
  };
}

function StageDots({ stage }) {
  const idx = STAGES.indexOf(stage);
  return (
    <span className="pl-dots" title={`${stage} (${idx + 1}/${STAGES.length})`}>
      {STAGES.map((s, i) => <i key={s} className={i <= idx ? "on" : ""} />)}
    </span>
  );
}

export default function Pipeline({ onNavigate }) {
  const engine = useEngine();
  // ⚠ THE PIPELINE IS GRAPH DATA, NOT RUN DATA — same defect the owner found in
  // Memoria de decisiones (2026-08-14). `status === "live"` means a completed
  // market RUN exists: trends, DNA, competitor scoring. This board reads
  // `product_bets`, which this file's own header calls "the permanent object
  // each accept births server-side" — created by a person accepting a proposal,
  // in the collection graph, with no crawl involved.
  //
  // So a connected brand whose pipeline had never been crawled showed its
  // BROWSER CACHE instead of its real bets, and `source` read "local" over data
  // the engine was holding. `EngineProvider`'s header states the rule: graph
  // screens use `useBrandId()`.
  const brandId = useBrandId();
  const live = Boolean(brandId);
  const [cards, setCards] = useState([]);       // unified: engine bets OR local cache
  const [source, setSource] = useState("local"); // "engine" | "local"
  const [showExample, setShowExample] = useState(false);
  const [dropping, setDropping] = useState(null); // key mid-drop (reason picker open)
  const [dragKey, setDragKey] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const [flash, setFlash] = useState(null);
  // Launch linking: moving to "En tienda" requires the REAL sales-feed
  // product key + launch date — an unlinked launch can never be graded.
  const [legacyCount, setLegacyCount] = useState(0);
  const [linking, setLinking] = useState(null);     // card key mid-launch
  const [linkProducts, setLinkProducts] = useState([]);
  const [linkKey, setLinkKey] = useState("");
  const [linkDate, setLinkDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Legacy/off-line path: accepted list + stage map in localStorage.
  // Depends on brandId: it closes over it, so an empty dep list meant a
  // reload after a brand switch replayed the PREVIOUS tenant's board (owner
  // audit P0, 2026-07-24). ACCEPTED_KEY is scoped too — it is a list of one
  // brand's accepted proposals, and was the last authoritative key still global.
  const loadLocal = useCallback(() => {
    const raw = readScoped(ACCEPTED_KEY, brandId, []) || [];
    const seen = new Set();
    const acc = raw.filter((a) => a?.key && !seen.has(a.key) && seen.add(a.key));
    const state = readScoped(PIPE_KEY, brandId, {});
    let changed = false;
    for (const a of acc) {
      if (!state[a.key]) {
        state[a.key] = { stage: "Decidido", history: [{ stage: "Decidido", at: a.at || new Date().toISOString() }] };
        changed = true;
      }
    }
    if (changed) writeScoped(PIPE_KEY, brandId, state);
    setCards(acc.map((a) => {
      const st = state[a.key];
      return {
        ...a,
        stage: st.stage,
        lastAt: st.history[st.history.length - 1]?.at,
        dropped: Boolean(st.droppedAt), dropReason: st.dropReason || null,
      };
    }));
    setSource("local");
  }, [brandId]);

  const reload = useCallback(async () => {
    if (live) {
      // The engine holds back bets created before the recommendation gates.
      // An empty board and "24 bets the current policy would refuse to make"
      // are very different statements, so say which (owner audit 2026-07-24).
      countLegacyBets(brandId).then(setLegacyCount);
      const bets = await getBets(brandId);
      if (bets) {
        setCards(bets.map(cardFromBet));
        setSource("engine");
        return;
      }
    }
    loadLocal();
  }, [live, brandId, loadLocal]);

  useEffect(() => { reload(); }, [reload]);

  function persistLocal(key, patch) {
    const state = readScoped(PIPE_KEY, brandId, {});
    state[key] = { ...state[key], ...patch };
    writeScoped(PIPE_KEY, brandId, state);
  }

  // One mover for drag, forward and back. Engine mode appends a bet_event —
  // the append-only record — then re-reads; local mode keeps the old cache.
  async function moveTo(key, stage) {
    const card = cards.find((c) => c.key === key);
    if (!card || card.dropped || card.stage === stage || !STAGES.includes(stage)) return;
    if (stage === "En tienda" && source === "engine") {
      // Launching requires the sales-feed link — open the picker instead.
      setLinking(key); setLinkKey("");
      setLinkProducts(await getSalesProducts(brandId));
      return;
    }
    setCards((cs) => cs.map((c) => (c.key === key ? { ...c, stage, lastAt: new Date().toISOString() } : c)));
    if (source === "engine") {
      try { await postBetEvent(brandId, key, STAGE_TO_KIND[stage]); }
      catch { setFlash("No se pudo guardar el movimiento — reintentá"); }
      reload();
    } else {
      const st = readScoped(PIPE_KEY, brandId, {})[key];
      persistLocal(key, { stage, history: [...(st?.history || []), { stage, at: new Date().toISOString() }] });
    }
  }
  async function confirmLaunch() {
    const key = linking;
    if (!key || !linkKey.trim()) { setFlash("Elegí la prenda del feed de ventas"); return; }
    setLinking(null);
    try {
      await postBetEvent(brandId, key, "tienda",
                         { product_key: linkKey.trim(), launched_on: linkDate });
    } catch { setFlash("No se pudo registrar el lanzamiento — reintentá"); }
    reload();
  }

  function step(key, delta) {
    const cur = cards.find((c) => c.key === key); if (!cur) return;
    const next = STAGES[STAGES.indexOf(cur.stage) + delta];
    if (next) moveTo(key, next);
  }
  async function drop(key, reason) {
    setDropping(null);
    setCards((cs) => cs.map((c) => (c.key === key ? { ...c, dropped: true, dropReason: reason } : c)));
    if (source === "engine") {
      try { await postBetEvent(brandId, key, "bajada", { reason }); }
      catch { setFlash("No se pudo guardar la baja — reintentá"); }
      reload();
    } else {
      persistLocal(key, { droppedAt: new Date().toISOString(), dropReason: reason });
    }
  }

  const tracked = cards.filter((c) => !c.dropped);
  const dropped = cards.filter((c) => c.dropped);
  const stuck = tracked.filter((c) => c.stage !== "En tienda" && daysSince(c.lastAt) >= STUCK_DAYS).length;
  const colOf = (stage) => tracked.filter((c) => c.stage === stage);
  const empty = cards.length === 0;

  return (
    <section className="view on">
      <style dangerouslySetInnerHTML={{ __html: `
        .pl-health{display:flex;gap:0;background:var(--card);border:1px solid var(--line);border-radius:13px;padding:14px 6px;margin-bottom:16px;overflow-x:auto}
        .pl-hstat{flex:1;min-width:86px;text-align:center;position:relative}
        .pl-hstat+.pl-hstat:before{content:"›";position:absolute;left:-6px;top:6px;color:var(--hair-2);font-size:15px}
        .pl-hstat .v{font-size:20px;font-weight:800;color:var(--ink)}
        .pl-hstat .l{font-size:11px;color:var(--ink-3);letter-spacing:.05em;text-transform:uppercase}
        .pl-cols{display:flex;gap:11px;align-items:flex-start;overflow-x:auto;padding-bottom:8px}
        .pl-col{flex:1;min-width:198px;background:var(--paper-2);border-radius:13px;padding:9px;transition:background .12s,outline .12s;outline:2px dashed transparent}
        .pl-col.over{background:var(--card);outline-color:var(--cobalt)}
        .pl-colh{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-2);padding:4px 6px 9px}
        .pl-colh .n{background:var(--card);border:1px solid var(--line);border-radius:999px;padding:1px 8px;font-size:11px}
        .pl-empty{border:1.5px dashed var(--line);border-radius:11px;padding:22px 10px;text-align:center;font-size:11px;color:var(--ink-3)}
        .pl-card{background:var(--card);border:1px solid var(--line);border-radius:12px;margin-bottom:9px;overflow:hidden;cursor:grab;transition:box-shadow .12s,transform .12s}
        .pl-card:hover{box-shadow:0 4px 14px rgba(20,18,12,.09);transform:translateY(-1px)}
        .pl-card.dragging{opacity:.45;cursor:grabbing}
        .pl-card.stuck{border-color:var(--ochre)}
        .pl-fig{position:relative;aspect-ratio:4/3;background:var(--paper-2)}
        .pl-fig .mtile{width:100%;height:100%;border-radius:0}
        .pl-fig .mtile img{width:100%;height:100%;object-fit:cover}
        .pl-age{position:absolute;top:7px;right:7px;font-size:11px;font-weight:800;letter-spacing:.04em;background:rgba(20,18,12,.72);color:#fff;border-radius:999px;padding:3px 8px}
        .pl-age.warn{background:var(--ochre);color:var(--ink)}
        .pl-body{padding:9px 11px 10px}
        .pl-t{font-size:12.5px;font-weight:650;color:var(--ink);line-height:1.25;margin-bottom:2px}
        .pl-m{font-size:11px;color:var(--ink-3)}
        .pl-src{font-size:11px;color:var(--ink-3);margin-top:3px}
        .pl-src b{color:var(--ink-2);font-weight:600}
        .pl-dots{display:inline-flex;gap:3px;margin-top:7px}
        .pl-dots i{width:14px;height:3.5px;border-radius:99px;background:var(--line)}
        .pl-dots i.on{background:var(--cobalt)}
        .pl-acts{display:flex;gap:5px;margin-top:8px;align-items:center}
        .pl-btn{border:1px solid var(--line);background:var(--paper-2);border-radius:8px;font-size:11px;font-weight:700;padding:5px 8px;cursor:pointer;color:var(--ink-2)}
        .pl-btn:hover{background:var(--card);color:var(--ink)}
        .pl-btn.fwd{flex:1;color:var(--ink)}
        .pl-btn.down{color:var(--clay);border-color:transparent;background:none;font-weight:600}
        .pl-close{display:block;width:100%;margin-top:8px;border:none;border-radius:8px;background:var(--sage);color:#fff;font-size:11px;font-weight:700;padding:7px 8px;cursor:pointer}
        .pl-reasons{display:flex;flex-direction:column;gap:4px;margin-top:8px}
        .pl-reason{border:1px solid var(--line);background:var(--paper-2);border-radius:8px;font-size:11px;padding:6px 8px;cursor:pointer;text-align:left}
        .pl-reason:hover{background:var(--card)}
        .pl-reason.cancel{border-style:dashed;color:var(--ink-3)}
        .pl-arch{display:flex;gap:9px;flex-wrap:wrap}
        .pl-archcard{display:flex;gap:9px;align-items:center;background:var(--paper-2);border:1px solid var(--line);border-radius:10px;padding:7px 11px 7px 7px;opacity:.75}
        .pl-archcard .im{width:34px;height:40px;border-radius:7px;overflow:hidden}
        .pl-archcard .im .mtile{width:100%;height:100%;border-radius:0}
        .pl-archcard .im .mtile img{width:100%;height:100%;object-fit:cover}
        .pl-archcard .t{font-size:11.5px;font-weight:600;color:var(--ink)}
        .pl-archcard small{display:block;font-size:11px;color:var(--ink-3)}
        .pl-src-chip{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;letter-spacing:.04em;border:1px solid var(--line);border-radius:999px;padding:4px 11px;color:var(--ink-2);background:var(--card)}
        .pl-src-chip i{width:7px;height:7px;border-radius:99px;background:var(--ink-3)}
        .pl-src-chip.engine i{background:var(--sage)}
        .pl-flash{background:var(--clay);color:#fff;border-radius:9px;padding:8px 12px;font-size:11.5px;font-weight:600;margin-bottom:12px}
        .pl-out{margin-top:7px;font-size:11px;border-radius:8px;padding:5px 8px;background:var(--paper-2);border:1px solid var(--line);color:var(--ink-2)}
        .pl-out b.ok{color:var(--sage)} .pl-out b.bad{color:var(--clay)}
      ` }} />

      <div className="vh">
        <div>
          <div className="eyebrow">Operar · Desarrollo</div>
          <h1>Desarrollo en curso</h1>
          <p>Lo que decidiste producir, de la aceptación a la tienda. Arrastrá la tarjeta a la etapa donde está — o usá las flechas.</p>
        </div>
        <span className={`pl-src-chip${source === "engine" ? " engine" : ""}`}
              title={source === "engine"
                ? "Cada tarjeta es un product_bet del motor; cada movimiento queda en su historial permanente."
                : "Sin motor: los movimientos viven solo en este navegador hasta que el motor esté disponible."}>
          <i />{source === "engine" ? "Equipo (motor)" : "Solo este navegador"}
        </span>
        {legacyCount > 0 && <span className="pl-legacy-chip"
          title="Creadas antes de que existieran las compuertas de recomendación: sin versión de política, sin resultado de compuerta, sin lanzamiento ni resultado medido. Se conservan como historial.">
          {legacyCount} decisi{legacyCount === 1 ? "ón" : "ones"} anterior{legacyCount === 1 ? "" : "es"} a la política — fuera del tablero
        </span>}
      </div>

      {flash && <div className="pl-flash" onClick={() => setFlash(null)}>{flash}</div>}

      {!empty && (
        <div className="pl-health">
          {STAGES.map((s) => (
            <div className="pl-hstat" key={s}>
              <span className="v">{colOf(s).length}</span>
              <div className="l">{s}</div>
            </div>
          ))}
          <div className="pl-hstat">
            <span className="v" style={{ color: stuck ? "var(--ochre)" : "var(--ink)" }}>{stuck}</span>
            <div className="l">trabados</div>
          </div>
        </div>
      )}

      {empty ? (
        <div className="ws-empty">
          Todavía no aprobaste ninguna propuesta. Cuando aceptás algo en Proposals,
          aparece acá en <b>Decidido</b> y lo vas moviendo hasta la tienda.
          <div style={{ marginTop: 12 }}>
            <button className="ws-btn primary" style={{ display: "inline-block", flex: "none" }} onClick={() => onNavigate?.("feed")}>
              Ir a Proposals →
            </button>
          </div>
        </div>
      ) : (
        <div className="pl-cols">
          {STAGES.map((stage) => {
            const items = colOf(stage);
            const isLast = stage === STAGES[STAGES.length - 1];
            return (
              <div
                className={`pl-col${overCol === stage ? " over" : ""}`}
                key={stage}
                onDragOver={(e) => { e.preventDefault(); setOverCol(stage); }}
                onDragLeave={() => setOverCol((c) => (c === stage ? null : c))}
                onDrop={(e) => {
                  e.preventDefault();
                  const key = e.dataTransfer.getData("text/plain") || dragKey;
                  if (key) moveTo(key, stage);
                  setOverCol(null); setDragKey(null);
                }}
              >
                <div className="pl-colh">{stage}<span className="n">{items.length}</span></div>
                {items.length === 0 && <div className="pl-empty">soltá una tarjeta acá</div>}
                {items.map((c) => {
                  const d = daysSince(c.lastAt);
                  const isStuck = !isLast && d >= STUCK_DAYS;
                  const idx = STAGES.indexOf(stage);
                  return (
                    <div
                      className={`pl-card${isStuck ? " stuck" : ""}${dragKey === c.key ? " dragging" : ""}`}
                      key={c.key}
                      draggable
                      onDragStart={(e) => { e.dataTransfer.setData("text/plain", c.key); e.dataTransfer.effectAllowed = "move"; setDragKey(c.key); }}
                      onDragEnd={() => { setDragKey(null); setOverCol(null); }}
                    >
                      <div className="pl-fig">
                        <Thumbnail color={c.color} fabric={c.fabric} img={c.image} />
                        <span className={`pl-age${isStuck ? " warn" : ""}`}>
                          {isStuck ? `⚠ ${d}d sin moverse` : d === 0 ? "hoy" : `${d}d acá`}
                        </span>
                      </div>
                      <div className="pl-body">
                        <div className="pl-t">{c.title}</div>
                        <div className="pl-m">{c.cat}{c.qty ? ` · test ${c.qty}` : ""}</div>
                        {c.trend && <div className="pl-src">↳ vía <b>{c.trend}</b></div>}
                        <StageDots stage={stage} />
                        {c.outcome && (
                          <div className="pl-out" title={c.outcome.basis}>
                            {c.outcome.verdict === "funciono" && <b className="ok">✓ funcionó</b>}
                            {c.outcome.verdict === "no_funciono" && <b className="bad">✕ no funcionó</b>}
                            {c.outcome.verdict === "en_mercado" && <>día {c.outcome.evidence?.days_elapsed ?? "?"} de {c.outcome.evidence?.days_total ?? 14} en mercado</>}
                            {["sin_vinculo", "sin_criterio", "sin_datos"].includes(c.outcome.verdict) && <>resultado: {c.outcome.verdict.replace("_", " ")}</>}
                          </div>
                        )}
                        {linking === c.key ? (
                          <div className="pl-reasons">
                            <div className="pl-m" style={{ padding: "2px 2px 4px" }}>
                              ¿Qué prenda es en tu feed de ventas? El resultado se
                              mide desde el lanzamiento con esa clave exacta.
                            </div>
                            <input className="pl-reason" list={`plk-${c.key}`} value={linkKey}
                                   placeholder={linkProducts.length ? "clave de producto…" : "sin feed de ventas todavía — clave manual"}
                                   onChange={(e) => setLinkKey(e.target.value)} />
                            <datalist id={`plk-${c.key}`}>
                              {linkProducts.map((p) => (
                                <option key={p.product_key} value={p.product_key}>{p.title}</option>
                              ))}
                            </datalist>
                            <input className="pl-reason" type="date" value={linkDate}
                                   max={new Date().toISOString().slice(0, 10)}
                                   onChange={(e) => setLinkDate(e.target.value)} />
                            <button className="pl-reason" style={{ fontWeight: 700 }} onClick={confirmLaunch}>
                              Lanzar y medir desde esta fecha
                            </button>
                            <button className="pl-reason cancel" onClick={() => setLinking(null)}>cancelar</button>
                          </div>
                        ) : dropping === c.key ? (
                          <div className="pl-reasons">
                            {DROP_REASONS.map((r) => (
                              <button key={r} className="pl-reason" onClick={() => drop(c.key, r)}>{r}</button>
                            ))}
                            <button className="pl-reason cancel" onClick={() => setDropping(null)}>cancelar</button>
                          </div>
                        ) : isLast ? (
                          <button className="pl-close" onClick={() => onNavigate?.("decisions")} title="Está en la tienda — el resultado se calcula solo de tus ventas; en Decisions lo ves">
                            ✓ En tienda · ver resultado →
                          </button>
                        ) : (
                          <div className="pl-acts">
                            {idx > 0 && <button className="pl-btn" title={`Volver a ${STAGES[idx - 1]}`} onClick={() => step(c.key, -1)}>←</button>}
                            <button className="pl-btn fwd" onClick={() => step(c.key, +1)}>{STAGES[idx + 1]} →</button>
                            <button className="pl-btn down" onClick={() => setDropping(c.key)}>Bajar</button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {dropped.length > 0 && (
        <>
          <div className="eyebrow" style={{ margin: "22px 0 10px" }}>Bajadas ({dropped.length})</div>
          <div className="pl-arch">
            {dropped.map((c) => (
              <div className="pl-archcard" key={c.key}>
                <div className="im"><Thumbnail color={c.color} fabric={c.fabric} img={c.image} /></div>
                <div><span className="t">{c.title}</span><small>{c.dropReason}</small></div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Reference only: a fully-populated board, clearly labelled sample. */}
      <div className="board-toolbar" style={{ marginTop: 20 }}>
        <button className="link" onClick={() => setShowExample((s) => !s)}>
          {showExample ? "Ocultar" : "Ver"} ejemplo de un board completo (muestra) →
        </button>
      </div>
      {showExample && (
        <div className="pl-cols example">
          {BOARD_ORDER.map((col) => (
            <div className="pl-col" key={col}>
              <div className="pl-colh">{col}<span className="n">{(BOARD[col] || []).length}</span></div>
              {(BOARD[col] || []).map((it, i) => (
                <div className="pl-card" key={i} style={{ cursor: "default" }}>
                  <div className="pl-body" style={{ display: "flex", gap: 9, alignItems: "center" }}>
                    <div style={{ width: 34, height: 40, borderRadius: 7, overflow: "hidden", flex: "none" }}>
                      <Thumbnail color={it.c} fabric={it.f} style={{ width: "100%", height: "100%", borderRadius: 0 }} />
                    </div>
                    <div>
                      <div className="pl-t">{it.n}</div>
                      <div className="pl-m">{it.cat}</div>
                      {it.blocker && <div className="pl-m" style={{ color: "var(--ochre)" }}>⚠ {it.blocker}</div>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
