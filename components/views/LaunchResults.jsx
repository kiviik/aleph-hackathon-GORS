"use client";
// Results, starting from what actually LAUNCHED.
//
// Priority 5 of the 2026-07-24 review: "Results should start from
// launch_product, not loosely related bets." A bet is a decision. A launch
// product is a thing that reached a channel on a date and can therefore be
// measured — and the difference is the whole basis of an honest outcome.
//
// THE DISTINCTION THIS SCREEN REFUSES TO COLLAPSE: a product nobody can measure
// and a product that sold nothing are completely different facts. Reporting
// both as "0" would be the single most misleading number the product could
// show, so the engine returns three states and this screen renders three.
import { useCallback, useEffect, useState } from "react";

import { useCollection } from "@/components/CollectionProvider";
import { useEngine, useBrandId } from "@/components/EngineProvider";
import { getLaunchResults, getLineage } from "@/lib/launches";

const STATE = {
  measured: { label: "medido", cls: "ok" },
  no_sales_yet: { label: "sin ventas todavía", cls: "wait" },
  not_measurable: { label: "no se puede medir", cls: "bad" },
};

// ⚠ MUST be `dangerouslySetInnerHTML`, never a style element with the CSS as a
// text child. React escapes `>` and `"` in a text child when it server-renders;
// the browser does not unescape inside <style>, so the server and client HTML
// differ and React throws the whole tree away on every load.
const CSS = `
/* ===== Resultados de lo lanzado — evidence-about-the-past restyle (lr2-) =====
   Results are a report on the past, so this reads as a measured record: one
   white KPI card with hairline cells, hairline rows, mono dates, and a "—" that
   is styled as an absence rather than dressed up as a number. */

.lr2-head{margin:0 0 var(--s5)}
.lr2-eyebrow{font-family:var(--d);font-size:11px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:var(--editorial)}
.lr2-head h1{font-family:var(--serif);font-weight:500;font-size:34px;line-height:1.1;letter-spacing:-.01em;color:var(--ink);margin:6px 0 8px}
.lr2-head p{font-size:14px;line-height:1.55;color:var(--ink-2);margin:0;max-width:64ch}

/* ---- notes: quiet by default, clay-washed when the read failed ---- */
.lr2-note{font-size:13px;line-height:1.55;color:var(--ink-2);border:1px solid var(--line);background:var(--surface);border-radius:var(--r-xs);padding:10px 13px;margin:0 0 var(--s3);max-width:70ch}
.lr2-note.bad{border:none;border-left:3px solid var(--danger);background:var(--clay-wash);border-radius:0 var(--r-xs) var(--r-xs) 0;color:var(--ink-2)}

/* ---- KPI strip: ONE white card, cells split by 1px hairlines ---- */
.lr2-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--hair);border:1px solid var(--hair);border-radius:var(--r);box-shadow:var(--shadow);overflow:hidden;margin:0 0 var(--s4)}
.lr2-kpi{background:var(--surface);padding:14px 16px}
.lr2-kpi span{display:block;font-family:var(--d);font-size:11px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);margin-bottom:6px}
.lr2-kpi b{display:block;font-family:var(--disp);font-size:22px;font-weight:600;line-height:var(--lh-flat);letter-spacing:-.01em;font-variant-numeric:tabular-nums;color:var(--ink)}
.lr2-kpi.bad b{color:var(--danger)}
.lr2-kpi.warn b{color:var(--warning)}

/* ---- the launched rows ---- */
.lr2-wrap{overflow-x:auto;background:var(--surface);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow)}
.lr2-table{width:100%;border-collapse:collapse;font-size:13px}
.lr2-table th{text-align:left;font-family:var(--d);font-size:11px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);background:var(--paper-2);padding:10px 14px;border-bottom:1px solid var(--line);white-space:nowrap}
.lr2-table th:nth-child(3),.lr2-table th:nth-child(4),.lr2-table th:nth-child(5){text-align:right}
.lr2-table td{padding:12px 14px;border-bottom:1px solid var(--hair);vertical-align:middle;color:var(--ink-2)}
.lr2-table tbody tr:last-child td{border-bottom:none}
.lr2-table tbody tr:hover td{background:var(--paper-2)}
.lr2-sku{font-family:var(--d);font-size:14px;font-weight:600;color:var(--ink);background:none;padding:0;letter-spacing:-.01em}
.lr2-when{font-family:var(--d);font-size:11px;font-variant-numeric:tabular-nums;color:var(--ink-3);white-space:nowrap}
.lr2-num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--ink)}
/* ⚠ An absence is styled AS an absence. It is never a zero and never a
   placeholder figure — that substitution is the one lie this screen exists to
   refuse. */
.lr2-none{color:var(--ink-3);font-size:12px}

/* ---- outcome pills ---- */
.lr2-state{display:inline-block;font-family:var(--d);font-size:11px;font-weight:500;letter-spacing:.04em;text-transform:uppercase;border-radius:999px;padding:3px 9px;white-space:nowrap;background:var(--paper-2);color:var(--ink-3)}
.lr2-state.ok{color:var(--positive);background:color-mix(in srgb,var(--positive) 12%,#fff)}
.lr2-state.wait{color:var(--warning);background:var(--ochre-wash)}
.lr2-state.bad{color:var(--danger);background:var(--clay-wash)}
.lr2-chain-ok{font-size:12px;font-weight:600;color:var(--positive)}
.lr2-chain-no{font-size:12px;font-weight:600;color:var(--warning)}

/* ---- the one pressable thing in a row, so it is the only blue ---- */
.lr2-lin{border:1px solid var(--line);background:var(--surface);border-radius:var(--r-xs);padding:6px 11px;font-size:12px;font-weight:600;color:var(--cobalt);cursor:pointer;white-space:nowrap}
.lr2-lin:hover{border-color:var(--cobalt);background:var(--cobalt-wash)}

/* ---- WHAT IT TAUGHT: sale → evidence. The payoff of the whole product, so
       it gets room rather than a footnote's worth of it. ---- */
.lr2-ln{background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--positive);border-radius:0 var(--r) var(--r) 0;box-shadow:var(--shadow);padding:18px 20px;margin-top:var(--s5)}
.lr2-ln.incomplete{border-left-color:var(--warning)}
.lr2-ln-h{display:flex;justify-content:space-between;align-items:baseline;gap:var(--s3);margin-bottom:var(--s3)}
.lr2-ln-h h3{font-family:var(--serif);font-weight:500;font-size:20px;line-height:1.2;color:var(--ink);margin:0}
.lr2-ln-h button{border:1px solid var(--line);background:var(--surface);border-radius:var(--r-xs);padding:5px 11px;font-size:12px;font-weight:600;color:var(--cobalt);cursor:pointer}
.lr2-ln-h button:hover{border-color:var(--cobalt);background:var(--cobalt-wash)}
.lr2-chain{list-style:none;padding:0;margin:0}
.lr2-chain li{display:flex;gap:var(--s4);align-items:baseline;padding:10px 0;border-bottom:1px solid var(--hair)}
.lr2-chain li:last-child{border-bottom:none}
.lr2-chain b{flex:0 0 180px;font-family:var(--d);font-size:11px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)}
.lr2-chain span{font-size:13px;line-height:1.55;color:var(--ink-2)}
/* the citation itself reads as a reference, not as prose */
.lr2-chain li:last-child span{font-family:var(--d);font-size:11px;color:var(--ink-3);word-break:break-word}
.lr2-ln-warn{font-size:13px;line-height:1.55;color:var(--ink-2);background:var(--ochre-wash);border-radius:var(--r-xs);padding:9px 12px;margin:var(--s3) 0 0}

/* ---- empty / loading: legitimately empty, so it must look intentional ---- */
.lr2-empty{display:grid;place-items:center;align-content:center;min-height:320px;text-align:center;color:var(--ink-3)}
.lr2-empty h4{font-family:var(--serif);font-weight:500;font-size:22px;line-height:1.25;color:var(--ink);margin:0 0 8px;max-width:34ch}
.lr2-empty p{max-width:40ch;margin:0;font-size:13px;line-height:1.55;color:var(--ink-3)}

@media(max-width:900px){
  .lr2-kpis{grid-template-columns:repeat(2,1fr)}
  .lr2-head h1{font-size:28px}
  .lr2-chain li{flex-direction:column;gap:4px}
  .lr2-chain b{flex:none}
}
`;

function Style() {
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}

function Header({ collectionName }) {
  return (
    <div className="lr2-head">
      <div className="lr2-eyebrow">
        Resultados{collectionName ? ` · ${collectionName}` : ""}
      </div>
      <h1>Resultados de lo lanzado</h1>
      <p>
        Cada fila es un producto que llegó a un canal en una fecha — no una
        decisión ni una apuesta. Una decisión que nunca se lanzó no tiene
        resultado que medir, y decir que vendió cero sería inventarlo.
      </p>
    </div>
  );
}

export default function LaunchResults() {
  const engine = useEngine();
  const { activeId, active } = useCollection();
  const brandId = useBrandId();
  const [data, setData] = useState({ loading: true, res: null, error: null });
  const [lineage, setLineage] = useState(null);

  const load = useCallback(async () => {
    if (!brandId) { setData({ loading: false, res: null, error: null }); return; }
    try {
      setData({ loading: false,
                res: await getLaunchResults(brandId, activeId), error: null });
    } catch (e) {
      setData({ loading: false, res: null, error: String(e.message || e) });
    }
  }, [brandId, activeId]);

  useEffect(() => { load(); }, [load]);

  if (data.loading) {
    return (
      <section className="view on lr2">
        <Style />
        <Header collectionName={active?.name} />
        <div className="lr2-empty"><h4>Cargando…</h4></div>
      </section>
    );
  }
  if (!brandId) {
    return (
      <section className="view on lr2">
        <Style />
        <Header collectionName={active?.name} />
        <div className="lr2-empty">
          <h4>Los resultados se leen del motor.</h4>
        </div>
      </section>
    );
  }

  const res = data.res;
  const items = res?.items || [];

  return (
    <section className="view on lr2">
      <Style />
      <Header collectionName={active?.name} />

      {data.error && <p className="lr2-note bad">No se pudo leer: {data.error}</p>}

      {res && (
        <div className="lr2-kpis">
          <div className="lr2-kpi">
            <span>productos lanzados</span><b>{res.total}</b>
          </div>
          <div className="lr2-kpi">
            <span>medibles</span><b>{res.measurable}</b>
          </div>
          <div className={`lr2-kpi${res.not_measurable ? " bad" : ""}`}>
            <span>sin SKU que se pueda medir</span><b>{res.not_measurable}</b>
          </div>
          <div className={`lr2-kpi${res.fully_traceable < res.total ? " warn" : ""}`}>
            <span>con cadena completa</span>
            <b>{res.fully_traceable}/{res.total}</b>
          </div>
        </div>
      )}

      {/* ⚠ AN ERROR IS NOT AN EMPTY LIST (owner review, 2026-08-14). This
          rendered the failure note AND THEN "Todavía no hay nada lanzado" —
          two claims that cannot both be true. If the read failed, Atelier does
          not know whether anything launched, and saying it is empty is the
          confident zero this product refuses everywhere else. The empty state
          is now only reachable when the read actually succeeded. */}
      {data.error ? (
        <div className="lr2-empty">
          <h4>No sabemos qué se lanzó.</h4>
          <p>
            La consulta al motor falló, así que esta pantalla no puede decir si
            hay lanzamientos o no — y una lista vacía sería una afirmación que
            nadie verificó.
          </p>
        </div>
      ) : !items.length ? (
        <div className="lr2-empty">
          <h4>
            Todavía no hay nada lanzado{active?.name ? ` en ${active.name}` : ""}.
          </h4>
          <p>
            Los resultados empiezan cuando un concepto aprobado sale a un canal.
          </p>
        </div>
      ) : (
        <div className="lr2-wrap">
          <table className="lr2-table">
            <thead>
              <tr>
                <th>SKU</th><th>Lanzamiento</th><th>Plan.</th><th>Vendidas</th>
                <th>Sell-through</th><th>Estado</th><th>Cadena</th><th />
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const st = STATE[r.state] || STATE.no_sales_yet;
                return (
                  <tr key={r.launch_product_id}>
                    <td><code className="lr2-sku">{r.sku}</code></td>
                    <td className="lr2-when">
                      {r.launch.channel} · {r.launch.market}
                      {r.launch.launch_date ? ` · ${r.launch.launch_date}` : ""}
                    </td>
                    <td className="lr2-num">
                      {r.planned_units ?? <span className="lr2-none">—</span>}
                    </td>
                    {/* null, not 0: the engine returns null when the SKU cannot
                        be joined at all, and rendering that as zero would be
                        the lie this screen exists to avoid. */}
                    <td className="lr2-num">
                      {r.units_sold === null
                        ? <span className="lr2-none">—</span>
                        : r.units_sold}
                    </td>
                    <td className="lr2-num">
                      {r.sell_through_pct === null
                        ? <span className="lr2-none">—</span>
                        : `${r.sell_through_pct}%`}
                    </td>
                    <td><span className={`lr2-state ${st.cls}`}>{st.label}</span></td>
                    <td>
                      <span className={r.traceable ? "lr2-chain-ok" : "lr2-chain-no"}>
                        {r.traceable ? "completa" : "incompleta"}
                      </span>
                    </td>
                    <td>
                      <button className="lr2-lin"
                              onClick={async () =>
                                setLineage(await getLineage(brandId, r.launch_product_id))}>
                        trazabilidad
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {lineage && (
        <div className={`lr2-ln${lineage.complete ? "" : " incomplete"}`}>
          <div className="lr2-ln-h">
            <h3>De la venta a la evidencia</h3>
            <button onClick={() => setLineage(null)}>cerrar</button>
          </div>
          {/* Read bottom-up on purpose: the question is "why did we make this",
              and the answer runs backwards from the thing that sold. */}
          <ol className="lr2-chain">
            <li><b>SKU lanzado</b><span>{lineage.launch_product?.sku}</span></li>
            <li><b>Concepto aprobado</b>
              <span>{lineage.concept_version?.concept?.name || "falta"}
                {lineage.concept_version?.concept?.approved_by
                  && ` · aprobó ${lineage.concept_version.concept.approved_by}`}</span></li>
            <li><b>Fila del plan</b><span>{lineage.slot?.slot_code || "falta"}</span></li>
            <li><b>Plan aprobado</b>
              <span>{lineage.plan_version
                ? `v${lineage.plan_version.version_number} · aprobó ${lineage.plan_version.approved_by}`
                : "falta"}</span></li>
            <li><b>Brief que lo gobierna</b>
              <span>{lineage.brief_version
                ? `v${lineage.brief_version.version_number} — ${lineage.brief_version.commercial_objective || "sin objetivo"}`
                : "falta"}</span></li>
            <li><b>Evidencia</b>
              <span>{lineage.evidence?.length
                ? lineage.evidence.map((e) => `${e.position}: ${e.evidence_id}`).join(" · ")
                : "falta"}</span></li>
          </ol>
          {!lineage.complete && (
            <p className="lr2-ln-warn">
              Falta un eslabón: esta venta no se puede explicar hasta el final.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
