"use client";
// LANZAMIENTO — where an approved decision becomes something measurable.
//
// Priority 3 of the 2026-07-24 review; redesigned 2026-08-07. The engine has had
// launches, launch products and lineage since migration 0033.
//
// WHAT THE REDESIGN CHANGED, AND WHY. The screen was a nine-field form with a
// list underneath, so the first thing it showed was data entry — and the last
// thing, if you scrolled, was the only question it exists to answer: *did this
// ship, and will we be able to grade it?* The form is a tool, not the subject.
// It is now collapsed, and the subject is the master–detail pair: what has been
// launched on the left, and the CHAIN behind the selected product on the right.
//
// The chain is drawn as a chain on purpose. `getLineage` returns concept version
// → plan slot → approved plan → governing brief → evidence, and `complete: false`
// when a link is absent. A missing link rendered as an empty field reads as a
// blank form; rendered as a broken link it reads as what it is — a launch whose
// history cannot be reconstructed in six months.
//
// The three refusals are still the ENGINE's, surfaced before you commit rather
// than after: a concept that is not approved cannot launch (the version pinning
// is pointless if the thing that ships was never signed); a slot from an
// unapproved plan cannot launch (no authorization, no spend); a SKU that matches
// no sales row can only launch if a person confirms it in their own name — and
// then it is labelled unmeasurable for the rest of its life, because a launch
// nobody can grade is the one thing this stage must never quietly produce.
import { useCallback, useEffect, useMemo, useState } from "react";

import { useCollection } from "@/components/CollectionProvider";
import { useEngine, useBrandId } from "@/components/EngineProvider";
import Icon from "@/components/ui/Icon";
import { useChrome } from "@/components/ui/Chrome";
import { listConcepts } from "@/lib/concepts";
import {
  addLaunchProduct, createLaunch, getLineage, listLaunches,
} from "@/lib/launches";
import { listPlanVersions } from "@/lib/collectionPlans";
import { getWorkspace } from "@/lib/workspace";

const today = () => new Date().toISOString().slice(0, 10);

const MATCH_LABEL = {
  exact: "SKU verificado contra tus ventas",
  confirmed_by_human: "SKU sin coincidencia — confirmado a mano",
  unverified: "SKU sin verificar — este lanzamiento no se podrá medir",
};
const MATCH_SHORT = {
  exact: "medible",
  confirmed_by_human: "confirmado a mano",
  unverified: "no medible",
};
const MATCH_TONE = { exact: "ok", confirmed_by_human: "warn", unverified: "bad" };

function dateText(value) {
  if (!value) return null;
  try {
    const d = new Date(String(value).length <= 10 ? `${value}T12:00:00` : value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
  } catch { return String(value); }
}

/* ----------------------------------------------------------------- chain -- */

function Link({ label, value, sub, ok }) {
  return (
    <li className={ok ? "on" : "off"}>
      <i />
      <div>
        <span className="lx-k">{label}</span>
        {ok
          ? <b>{value}</b>
          : <b className="lx-broken">eslabón faltante</b>}
        {ok && sub && <small>{sub}</small>}
      </div>
    </li>
  );
}

function Chain({ data, product }) {
  if (!data) {
    return (
      <p className="lx-hint">
        Elegí un producto lanzado para ver de dónde viene. La cadena es lo que
        permite, dentro de seis meses, decir por qué se lanzó — no sólo que se
        lanzó.
      </p>
    );
  }
  const concept = data.concept_version?.concept;
  return (
    <>
      <div className="lx-chain-head">
        <code>{product?.sku}</code>
        <span className={`lx-tag ${MATCH_TONE[product?.sku_match] || ""}`}>
          {MATCH_SHORT[product?.sku_match] || product?.sku_match}
        </span>
      </div>

      <ul className="lx-chain">
        <Link ok={!!concept} label="Concepto aprobado" value={concept?.name}
              sub={concept?.approved_by ? `aprobó ${concept.approved_by}` : null} />
        <Link ok={!!data.slot} label="Fila del plan" value={data.slot?.slot_code}
              sub={data.slot?.retail_price ? `PVP ${data.slot.retail_price}` : null} />
        <Link ok={!!data.plan_version} label="Plan aprobado"
              value={data.plan_version && `v${data.plan_version.version_number}`}
              sub={data.plan_version?.approved_by ? `aprobó ${data.plan_version.approved_by}` : null} />
        <Link ok={!!data.brief_version} label="Brief que lo gobierna"
              value={data.brief_version && `v${data.brief_version.version_number}`}
              sub={data.brief_version?.commercial_objective} />
        <Link ok={!!data.evidence?.length} label="Evidencia"
              value={data.evidence?.length ? `${data.evidence.length} enlace(s)` : null} />
      </ul>

      {!data.complete && (
        <p className="lx-warn">
          <Icon name="warn" />
          Falta un eslabón. Dentro de seis meses esta parte de la cadena no se va
          a poder reconstruir: quedará el resultado, sin la decisión que lo
          produjo.
        </p>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- screen -- */

export default function Launch({ onNavigate }) {
  const engine = useEngine();
  const { activeId, active } = useCollection();
  const brandId = useBrandId();

  const [data, setData] = useState({ loading: true, concepts: [], slots: [],
                                     launches: [], ws: null, error: null });
  const [form, setForm] = useState({
    conceptId: "", slotId: "", sku: "", planned_units: "", received_units: "",
    initial_price: "", channel: "DTC", market: "AR", launch_date: today(),
  });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [refusal, setRefusal] = useState(null);
  const [lineage, setLineage] = useState(null);
  const [pickedId, setPickedId] = useState(null);

  const load = useCallback(async () => {
    if (!brandId || !activeId) { setData((d) => ({ ...d, loading: false })); return; }
    try {
      const ws = await getWorkspace(brandId, activeId);
      const concepts = (await listConcepts(brandId, activeId))
        .filter((c) => c.approved_version_id);
      let slots = [];
      if (ws.plan?.id) {
        const { items = [] } = await listPlanVersions(brandId, ws.plan.id);
        // Only an APPROVED plan version authorizes a spend, so only its rows are
        // offered. Draft rows here would invite a launch the engine will refuse.
        const approved = items.find((v) => v.status === "approved");
        slots = approved?.slots || [];
      }
      const { items: launches = [] } = await listLaunches(brandId);
      setData({ loading: false, concepts, slots,
                launches: launches.filter((l) => l.collection_id === activeId),
                ws, error: null });
    } catch (e) {
      setData((d) => ({ ...d, loading: false, error: String(e.message || e) }));
    }
  }, [brandId, activeId]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Every launched product, flattened, with the launch it belongs to. The
  // grouping matters for the header, not for the queue: what a person scans for
  // is a garment, not a channel.
  const products = useMemo(
    () => data.launches.flatMap((l) => (l.products || []).map((p) => ({ ...p, launch: l }))),
    [data.launches]);

  const counts = useMemo(() => ({
    total: products.length,
    measurable: products.filter((p) => p.sku_match === "exact").length,
    manual: products.filter((p) => p.sku_match === "confirmed_by_human").length,
    blind: products.filter((p) => p.sku_match === "unverified").length,
  }), [products]);

  const picked = products.find((p) => p.id === pickedId) || null;

  async function showChain(product) {
    setPickedId(product.id);
    setLineage(null);
    setLineage(await getLineage(brandId, product.id).catch(() => null));
  }

  async function record(confirmUnmatched = false) {
    setBusy(true); setNotice(""); setRefusal(null);
    try {
      // One launch per (channel, market, date) is enough for the pilot: reuse an
      // existing one rather than minting a duplicate for every product.
      let launch = data.launches.find(
        (l) => l.channel === form.channel && l.market === form.market
               && String(l.launch_date) === form.launch_date);
      if (!launch) {
        launch = await createLaunch(brandId, {
          collection_id: activeId,
          name: `${active?.name || "Colección"} · ${form.channel}`,
          channel: form.channel, market: form.market,
          launch_date: form.launch_date, status: "live",
        });
      }
      const concept = data.concepts.find((c) => c.id === form.conceptId);
      const product = await addLaunchProduct(brandId, launch.id, {
        sku: form.sku.trim(),
        assortment_slot_id: form.slotId || null,
        approved_concept_version_id: concept?.approved_version_id || null,
        planned_units: form.planned_units ? Number(form.planned_units) : null,
        received_units: form.received_units ? Number(form.received_units) : null,
        initial_price: form.initial_price || null,
        confirm_unmatched_sku: confirmUnmatched,
      });
      setPickedId(product.id);
      setLineage(await getLineage(brandId, product.id).catch(() => null));
      setNotice(`Lanzado. ${MATCH_LABEL[product.sku_match]}`);
      setForm((f) => ({ ...f, sku: "", conceptId: "", slotId: "" }));
      setOpen(false);
      await load();
    } catch (e) {
      if (e.detail?.error === "sku_not_in_sales_data") setRefusal(e.detail);
      else setNotice(`El motor rechazó el lanzamiento: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  const ready = form.sku.trim() && form.conceptId;

  /* ---- chrome ---------------------------------------------------------- */

  const unknowns = [];
  if (!data.slots.length) {
    unknowns.push("Ninguna versión del plan está aprobada: sin eso el gasto no está autorizado y las filas no se pueden enlazar.");
  }
  if (counts.blind) {
    unknowns.push(`${counts.blind} producto(s) sin SKU verificado — su resultado no va a poder medirse contra ventas.`);
  }
  if (!data.concepts.length) {
    unknowns.push("No hay conceptos aprobados en esta colección todavía.");
  }

  useChrome({
    read: !data.loading && brandId && activeId
      ? {
          interpretation: counts.total
            ? `${counts.measurable} de ${counts.total} producto(s) lanzados tienen un SKU que Atelier puede seguir hasta tus ventas. El resto quedará como decisión registrada sin resultado medible.`
            : "Todavía no se lanzó nada en esta colección. Aprobado no es lanzado: hasta que algo llega a un canal en una fecha, no hay resultado que medir.",
          signals: [
            { icon: "coin", label: "Lanzamientos", text: String(data.launches.length) },
            { icon: "check", label: "Conceptos aprobados disponibles", text: String(data.concepts.length) },
            { icon: "doc", label: "Filas del plan aprobado", text: String(data.slots.length) },
          ],
          against: counts.blind
            ? [`${counts.blind} SKU sin coincidencia en tus ventas: se lanzaron bajo la responsabilidad de quien los confirmó.`]
            : [],
          unknowns,
          trace: [
            { icon: "doc", label: "Origen", text: "launches + launch_products del motor (0033)" },
            { icon: "shield", label: "Trazabilidad", text: "concepto → fila → plan → brief, reconstruida por el motor" },
          ],
        }
      : null,
    decision: brandId && activeId && data.concepts.length
      ? {
          note: open
            ? "Registrar un lanzamiento fija el concepto aprobado, la fila del plan y el SKU con el que después se medirá. No se puede deshacer sin dejar rastro."
            : "Aprobado no es lanzado. Registrá lo que efectivamente salió, con el SKU que aparece en tus ventas.",
          actions: open
            ? [
                { label: "Cancelar", icon: "x", disabled: busy, onClick: () => setOpen(false) },
                { label: busy ? "Registrando…" : "Registrar lanzamiento", primary: true,
                  disabled: !ready || busy, onClick: () => record(false) },
              ]
            : [{ label: "Registrar un lanzamiento", primary: true, onClick: () => setOpen(true) }],
        }
      : null,
  }, [open, busy, ready, counts.total, counts.measurable, data.concepts.length, data.slots.length, unknowns.length]);

  /* ---- honest states --------------------------------------------------- */

  const frame = (children) => (
    <section className="lx">
      <div className="ax-crumb"><b>{engine.brandName || "Atelier"}</b><span>·</span>Lanzamiento</div>
      {children}
    </section>
  );

  if (data.loading) {
    return frame(<><div className="ax-sk line w45" /><div className="ax-sk title" /><div className="ax-sk block" /></>);
  }
  if (!brandId) {
    return frame(<>
      <h1 className="ax-h1">Los lanzamientos viven en el motor</h1>
      <p className="ax-lede">
        Un lanzamiento es lo que después permite medir una decisión. Sin conexión
        no se registra acá — se perdería justo el eslabón que lo hace medible.
      </p>
    </>);
  }
  if (!activeId) {
    return frame(<>
      <h1 className="ax-h1">Elegí una colección</h1>
      <p className="ax-lede">Se lanza por colección, y se mide por colección.</p>
    </>);
  }

  return frame(
    <>
      <h1 className="ax-h1">Lanzamiento</h1>
      <p className="ax-lede">
        Aprobado no es lanzado. Hasta que algo llega a un canal en una fecha no hay
        resultado que medir — y atribuir ventas a una aprobación es como un registro
        de decisiones se convierte en un relato.
      </p>

      {data.error && <p className="lx-warn"><Icon name="warn" />No se pudo leer: {data.error}</p>}
      {notice && <p className="lx-notice">{notice}</p>}

      {/* What can actually be graded, in one strip. Three numbers that mean
          three different futures for the same launch. */}
      <div className="lx-band">
        <div className="lx-cell">
          <span className="lx-cell-l">Productos lanzados</span>
          <b>{counts.total}</b>
        </div>
        <div className="lx-cell">
          <span className="lx-cell-l">Medibles contra ventas</span>
          <b className={counts.measurable ? "ok" : ""}>{counts.measurable}</b>
        </div>
        <div className="lx-cell">
          <span className="lx-cell-l">Confirmados a mano</span>
          <b className={counts.manual ? "warn" : ""}>{counts.manual}</b>
        </div>
        <div className="lx-cell">
          <span className="lx-cell-l">Sin verificar</span>
          <b className={counts.blind ? "bad" : ""}>{counts.blind}</b>
        </div>
      </div>

      {refusal && (
        <div className="lx-refusal">
          <b>El motor no aceptó el SKU “{refusal.sku}”.</b>
          <p>{refusal.message}</p>
          <button className="ax-btn" disabled={busy} onClick={() => record(true)}>
            Confirmar igual — queda registrado a mi nombre
          </button>
        </div>
      )}

      {/* the form, as a tool: present, complete, and not the first thing */}
      {open && (
        <div className="lx-form-card">
          <span className="ax-label">Registrar un lanzamiento</span>
          {!data.concepts.length ? (
            <p className="lx-hint">
              No hay conceptos aprobados en esta colección. Un concepto sin aprobar
              no se puede lanzar: la versión exacta que se aprueba es la que después
              se mide.
            </p>
          ) : (
            <div className="lx-form">
              <label><span>Concepto aprobado</span>
                <select className="rb-input" value={form.conceptId} onChange={set("conceptId")}>
                  <option value="">—</option>
                  {data.concepts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name || c.client_key}{c.approved_by ? ` · aprobó ${c.approved_by}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label><span>Fila del plan aprobado</span>
                <select className="rb-input" value={form.slotId} onChange={set("slotId")}>
                  <option value="">—</option>
                  {data.slots.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.slot_code}{s.category ? ` · ${s.category}` : ""}
                    </option>
                  ))}
                </select>
                {!data.slots.length && (
                  <i>Sin plan aprobado: el gasto no está autorizado todavía.</i>
                )}
              </label>
              <label><span>SKU (como figura en tus ventas)</span>
                <input className="rb-input" value={form.sku} onChange={set("sku")}
                       placeholder="REMERA-TIGRE-AW26" />
              </label>
              <label><span>Unidades planificadas</span>
                <input className="rb-input" value={form.planned_units} onChange={set("planned_units")} inputMode="numeric" />
              </label>
              <label><span>Unidades recibidas</span>
                <input className="rb-input" value={form.received_units} onChange={set("received_units")} inputMode="numeric" />
              </label>
              <label><span>Precio inicial</span>
                <input className="rb-input" value={form.initial_price} onChange={set("initial_price")} inputMode="decimal" />
              </label>
              <label><span>Canal</span>
                <input className="rb-input" value={form.channel} onChange={set("channel")} /></label>
              <label><span>Mercado</span>
                <input className="rb-input" value={form.market} onChange={set("market")} /></label>
              <label><span>Fecha</span>
                <input className="rb-input" type="date" value={form.launch_date} onChange={set("launch_date")} />
              </label>
            </div>
          )}
        </div>
      )}

      {/* master · detail — what shipped, and the chain behind the one you pick */}
      <div className="lx-main">
        <section className="lx-list">
          <header>
            <h2>Lo que ya salió</h2>
            <span>{products.length}</span>
          </header>
          <div className="lx-scroll">
            {!data.launches.length ? (
              <p className="lx-hint">
                Nada lanzado todavía en {active?.name || "esta colección"}. Los
                conceptos aprobados esperan acá hasta que alguien registre lo que
                efectivamente salió.
              </p>
            ) : data.launches.map((l) => (
              <div className="lx-group" key={l.id}>
                <div className="lx-gh">
                  <b>{l.name}</b>
                  <span>{l.channel} · {l.market} · {dateText(l.launch_date)}</span>
                  <span className={`lx-tag ${l.gradable ? "ok" : "bad"}`}>
                    {l.gradable ? "medible" : "no se podrá medir"}
                  </span>
                </div>
                {(l.products || []).map((p) => (
                  <button key={p.id} className={`lx-row${p.id === pickedId ? " on" : ""}`}
                          onClick={() => showChain(p)}>
                    <code>{p.sku}</code>
                    <span className={`lx-tag ${MATCH_TONE[p.sku_match] || ""}`}>
                      {MATCH_SHORT[p.sku_match] || p.sku_match}
                    </span>
                    <span className="lx-units">
                      {p.planned_units != null ? `${p.planned_units} plan.` : "sin plan."}
                      {p.received_units != null ? ` · ${p.received_units} recib.` : ""}
                    </span>
                  </button>
                ))}
                {!(l.products || []).length && (
                  <p className="lx-hint">Este lanzamiento no tiene productos cargados.</p>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="lx-detail">
          <span className="ax-label">De dónde viene</span>
          <Chain data={lineage} product={picked} />
          {picked && onNavigate && (
            <button className="ax-btn" style={{ marginTop: 16 }}
                    onClick={() => onNavigate("launchresults")}>
              Ver resultados de lanzamiento
            </button>
          )}
        </section>
      </div>
    </>,
  );
}
