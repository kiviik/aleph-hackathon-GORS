"use client";
// PLAN DE RANGO, as a board of garments (owner reference 05, 2026-08-06).
//
// The plan was a spreadsheet. A range is a set of commitments about CLOTHES,
// and you cannot judge whether a range is balanced by reading rows — you judge
// it by seeing the pieces next to each other. This renders the same
// server-owned slots as the grid below it, as the things they are.
//
// IT ADDS, IT DOES NOT REPLACE. `RangeSlots` stays underneath with the editing,
// submission and approval it already owns; nothing here writes.
//
// GROUPED BY CATEGORY, NOT BY "ROLE" — and the reason has CHANGED, so read
// this before assuming it still says what it used to.
//
// It used to say the engine had no such field, and that if roles were wanted
// they were "a column on the slot first, and a redesign second". That
// condition has since been met: `assortment_slots.tier` (hero | core | fashion
// | entry, migration 0065) exists and a merchandiser sets it in the Tabla.
//
// This still groups by category, now for a different and smaller reason: tier
// is OPTIONAL and usually unset, so grouping by it would file most of the range
// under "sin rol" and bury the board. The original objection — that grouping by
// an invented role puts a merchandising judgement on screen that nobody made —
// no longer applies, because the tier is declared by a person or it is absent.
// Grouping by tier is a reasonable future option once brands actually fill it
// in; it is not blocked on the engine any more.
//
// Every number is the engine's. `financials.computable` is respected: a slot
// with no landed cost shows "sin costo", never a zero margin.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useCollection } from "@/components/CollectionProvider";
import { useBrandId } from "@/components/EngineProvider";
import Icon from "@/components/ui/Icon";
import { blockerText } from "@/lib/commandCentre";
import { isStale, patchSlot } from "@/lib/collectionPlans";
import { getWorkspace } from "@/lib/workspace";
import { canQueryCollection } from "@/lib/collectionScope";
import { getConceptCovers } from "@/lib/api";
import { engineFetch } from "@/lib/auth";
import { moneyText, pctText } from "@/lib/money.mjs";

// ⚠ Engine calls go through `engineFetch`, which attaches the bearer token.
// A plain `fetch` works in demo mode and 401s the moment production auth is
// on (owner security review, 2026-08-12) — the screen would simply go blank
// for an authenticated user, which is the hardest kind of break to attribute.
const API_BASE = process.env.NEXT_PUBLIC_ATELIER_API || "http://127.0.0.1:8000";

const CARRY_LABEL = { new: "Dirección nueva", carryover: "Carryover", proven: "Probado" };
const RISK_LABEL = { experiment: "Experimento", low: "Bajo", medium: "Medio", high: "Alto" };

// ⚠ ABSENT IS NOT ZERO, AND `Number()` DISAGREES — the rule and the reasoning
// live in `lib/money.mjs`, because this screen was the THIRD independent copy
// of the formatter and the one that got it wrong: a plan with no budget showed
// «ARS 0» for Presupuesto and open-to-buy while the collection overview beside
// it correctly said the budget was missing. A buyer can commit cash against a
// fabricated zero.
//
// Every caller here already renders the honest word («sin definir», «no
// calculable», «—»), so the only thing that had to change is the lie.
const money = (value, currency) => moneyText(value, currency);

const pct = (value) => pctText(value);

/* ------------------------------------------------------------ distribution */

// A share bar over ONE dimension of the range. Segments are counts, never
// percentages of an assumed whole: a range with three uncategorised slots must
// not silently render as if they belonged somewhere.
function Share({ icon, label, parts, total }) {
  if (!total) return null;
  return (
    <div className="rb-share">
      <div className="rb-share-head"><Icon name={icon} /><span>{label}</span></div>
      <div className="rb-bar">
        {parts.map((p) => (
          <span key={p.key} style={{ width: `${(p.n / total) * 100}%`, background: p.color }}
                title={`${p.label}: ${p.n}`} />
        ))}
      </div>
      <div className="rb-legend">
        {parts.map((p) => (
          <span key={p.key}><i style={{ background: p.color }} />{p.label} · <b>{p.n}</b></span>
        ))}
      </div>
    </div>
  );
}


// The fields a merchandiser edits, same set and same order as the table. A
// field the engine will not accept must not look editable, so this list is the
// table's COLUMNS minus the two identity columns it never patches.
const EDITABLE = [
  { key: "planned_units", label: "Unidades planificadas", num: true },
  { key: "retail_price", label: "Precio retail", num: true },
  { key: "landed_cost", label: "Costo puesto", num: true },
  { key: "moq_units", label: "MOQ", num: true },
  { key: "lead_time_days", label: "Lead time (días)", num: true },
  { key: "delivery_date", label: "Entrega", date: true },
];

// Commits on blur, never on keystroke: every keypress would be a write, and a
// half-typed price is a number the engine would have to believe.
function Field({ col, value, busy, onCommit }) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => { setDraft(value ?? ""); }, [value]);
  return (
    <input
      className="rb-input"
      type={col.date ? "date" : col.num ? "number" : "text"}
      value={draft}
      disabled={busy}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const next = draft === "" ? null : draft;
        if (String(next ?? "") !== String(value ?? "")) onCommit(col.key, next);
      }}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
    />
  );
}

/* ----------------------------------------------------------------- screen */

export default function RangeBoard({ nonce = 0, onChanged }) {
  const brandId = useBrandId();
  const { activeId, collections, loading: collectionsLoading,
          brandId: collectionsBrandId } = useCollection();
  const [version, setVersion] = useState(null);
  const [covers, setCovers] = useState({});
  const [selected, setSelected] = useState(null);
  const [state, setState] = useState({ loading: true, error: null });
  const [saving, setSaving] = useState(null);
  const [saveError, setSaveError] = useState("");

  // ⚠ A LATE PLAN BELONGS TO THE COLLECTION YOU LEFT (owner review,
  // 2026-08-14). Two awaits and no cancellation: switch collection while the
  // workspace call is in flight and the previous collection's version lands in
  // `version` — which is not merely displayed, it is what the grid EDITS.
  // `saveCell` then patches slot ids belonging to the collection the user
  // walked away from, under a header naming the new one.
  //
  // Same generation counter as CollectionProvider and CollectionBrief. Every
  // write path checks it, including the error path: an error about the old
  // collection must not blank the new one's grid.
  const generation = useRef(0);

  const load = useCallback(async () => {
    const mine = ++generation.current;
    // ⚠ The generation counter above handles a LATE answer. This handles a
    // question that should never have been asked. On a brand switch `brandId`
    // updates a render before `activeId` is cleared, so both are truthy and
    // belong to different tenants — the workspace call then 404s, throws, and
    // puts a real ERROR on screen for a request we made by mistake.
    if (!canQueryCollection({ brandId, activeId, collections,
                              collectionsBrandId, loading: collectionsLoading })) {
      // Not an error, and not "this collection has no plan": we have not asked
      // yet. Stay loading while the collection list resolves so a brand switch
      // does not flash an empty board.
      setVersion(null);
      setState({ loading: Boolean(collectionsLoading), error: null });
      return;
    }
    setState({ loading: true, error: null });
    try {
      const ws = await getWorkspace(brandId, activeId);
      if (mine !== generation.current) return;
      // The version somebody is working on wins over the approved one — it is
      // what the grid below is editing, and two panels disagreeing about which
      // version they show is worse than showing neither.
      const vid = ws?.plan?.open_version?.id || ws?.plan?.approved_version?.id;
      if (!vid) { setVersion(null); setState({ loading: false, error: null }); return; }
      const res = await engineFetch(`${API_BASE}/brands/${brandId}/plan-versions/${vid}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`plan ${res.status}`);
      const body = await res.json();
      if (mine !== generation.current) return;
      setVersion(body);
      setState({ loading: false, error: null });
    } catch (e) {
      if (mine !== generation.current) return;
      setState({ loading: false, error: String(e.message || e) });
    }
    // `collections` and `collectionsLoading` are dependencies because the guard
    // above reads them: without them this never re-runs when the list finally
    // arrives, and the board sits in loading forever.
  }, [brandId, activeId, collections, collectionsBrandId, collectionsLoading]);

  useEffect(() => { load(); }, [load, nonce]);

  useEffect(() => {
    // Same mismatched-pair guard as the loader above.
    if (!canQueryCollection({ brandId, activeId, collections,
                              collectionsBrandId, loading: collectionsLoading })) return;
    getConceptCovers(brandId, activeId, 24)
      .then((r) => setCovers(Object.fromEntries((r?.covers || []).map((c) => [c.concept_id, c]))))
      .catch(() => setCovers({}));
  }, [brandId, activeId, collections, collectionsBrandId, collectionsLoading]);

  const slots = useMemo(() => version?.slots || [], [version]);

  const groups = useMemo(() => {
    const by = new Map();
    for (const s of slots) {
      const k = s.category || "Sin categoría";
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(s);
    }
    return [...by.entries()].map(([label, items]) => ({ label, items }));
  }, [slots]);

  const dist = useMemo(() => {
    const count = (fn) => slots.filter(fn).length;
    return {
      carry: [
        { key: "new", label: "Dirección nueva", n: count((s) => s.carryover_type === "new"), color: "var(--oxblood)" },
        { key: "carry", label: "Carryover", n: count((s) => s.carryover_type === "carryover"), color: "var(--sage)" },
        { key: "other", label: "Sin declarar", n: count((s) => !["new", "carryover"].includes(s.carryover_type)), color: "var(--hair-2)" },
      ],
      concept: [
        { key: "yes", label: "Con concepto", n: count((s) => s.concept_id), color: "var(--sage)" },
        { key: "no", label: "Falta asignar", n: count((s) => !s.concept_id), color: "var(--clay)" },
      ],
      cost: [
        { key: "ok", label: "Margen calculable", n: count((s) => s.financials?.computable), color: "var(--sage)" },
        { key: "no", label: "Sin costo", n: count((s) => !s.financials?.computable), color: "var(--ochre)" },
      ],
    };
  }, [slots]);

  async function save(slot, field, value) {
    setSaving(slot.id); setSaveError("");
    try {
      await patchSlot(brandId, slot.id, { [field]: value }, version?.revision);
      await load();
      onChanged?.();
    } catch (e) {
      // The engine's refusal, verbatim. A stale revision is its own message
      // because "somebody else changed this" is a different problem from
      // "this value is invalid".
      setSaveError(isStale(e)
        ? "Alguien más cambió el plan mientras editabas. Recargá para ver la versión actual."
        : String(e.message || e));
    } finally {
      setSaving(null);
    }
  }

  const readiness = version?.readiness;
  const flagsFor = (code) => [
    ...(readiness?.blockers || []).filter((b) => b.slot === code).map((b) => ({ ...b, tone: "bad" })),
    ...(readiness?.warnings || []).filter((w) => w.slot === code).map((w) => ({ ...w, tone: "warn" })),
  ];

  if (!brandId || !activeId) return null;
  if (state.loading) {
    return <div className="rb"><div className="ax-sk title" /><div className="ax-sk block" /></div>;
  }
  if (state.error) {
    return <div className="rb"><p className="ax-lede">No se pudo leer el plan: {state.error}</p></div>;
  }
  if (!version || !slots.length) return null;

  const t = version.totals || {};
  const cur = t.currency;
  const sel = slots.find((s) => s.id === selected) || slots[0];
  const selFlags = flagsFor(sel.slot_code);
  const selCover = sel.concept_id ? covers[sel.concept_id] : null;
  // The SAME predicate the table uses. An approved or superseded version is
  // immutable — the engine answers 409 — so an input on one is an affordance
  // for something that cannot happen. Found by editing a field and reading the
  // network tab, not by any test.
  const editable = version.status === "draft" || version.status === "in_review";

  return (
    <section className="rb">
      {/* No title here: this mounts under the screen's own "Plan de
          rango" heading, and repeating it read as two screens stacked. */}
      <div className="rb-chips">
        <span><i className="sage" />v{version.version_number} {version.status}</span>
        <span>{t.slots} filas</span>
        <span>{dist.concept[0].n} conceptos asignados</span>
        {t.slots_without_financials > 0 && (
          <span><i className="ochre" />{t.slots_without_financials} costos pendientes</span>
        )}
        {(readiness?.blockers?.length || 0) > 0 && (
          <span><i className="clay" />{readiness.blockers.length} bloqueo(s)</span>
        )}
        {t.margin_pct && <span>margen {pct(t.margin_pct)}</span>}
      </div>

      {/* ONE horizontal band, groups as columns — not eight stacked blocks.
          Stacking category after category grew the page by a screenful per
          category and made comparing a coat against a trouser a scroll instead
          of a glance, which is the entire point of an assortment board. The
          band scrolls sideways inside itself; the page does not grow. */}
      <div className="rb-board">
        {groups.map((g) => (
          <div className="rb-col" key={g.label}>
            <div className="rb-col-head">{g.label}<span>{g.items.length}</span></div>
            <div className="rb-col-cards">
              {g.items.map((s) => {
                const cov = s.concept_id ? covers[s.concept_id] : null;
                const flags = flagsFor(s.slot_code);
                return (
                  <button
                    key={s.id}
                    className={`rb-card${sel.id === s.id ? " on" : ""}`}
                    onClick={() => setSelected(s.id)}
                  >
                    <span className="rb-code">{s.slot_code}</span>
                    <span className="rb-shot">
                      {cov ? (
                        <img src={cov.image_data_uri} alt="" loading="lazy" />
                      ) : (
                        <span className="rb-shot-empty"><Icon name="doc" /></span>
                      )}
                    </span>
                    <b>{s.style_intent || s.slot_code}</b>
                    <span className="rb-meta">
                      {s.carryover_type ? (CARRY_LABEL[s.carryover_type] || s.carryover_type) : "sin declarar"}
                    </span>
                    <span className={`rb-tag${flags.some((f) => f.tone === "bad") ? " bad"
                      : flags.length ? " warn" : cov ? " ok" : ""}`}>
                      {flags.some((f) => f.tone === "bad") ? "Bloqueado"
                        : flags.length ? "Atención"
                        : cov ? "Asignado" : "Sin concepto"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* The selected row, at the size you would actually judge it. */}
      <article className="rb-detail">
        <div className="rb-detail-shot">
          {selCover ? <img src={selCover.image_data_uri} alt="" />
            : <span className="rb-shot-empty"><Icon name="doc" /></span>}
        </div>
        <div className="rb-detail-id">
          <span className="ax-label">{sel.slot_code}</span>
          <h3>{sel.style_intent || sel.slot_code}</h3>
          <dl>
            <dt>Categoría</dt><dd>{sel.category || "—"}</dd>
            <dt>Colorway</dt><dd>{sel.colorway || "sin declarar"}</dd>
            <dt>Origen</dt><dd>{CARRY_LABEL[sel.carryover_type] || "sin declarar"}</dd>
            {sel.risk_level && <><dt>Riesgo</dt><dd>{RISK_LABEL[sel.risk_level] || sel.risk_level}</dd></>}
          </dl>
        </div>
        <div className="rb-detail-facts">
          <span className="ax-label">Hechos comerciales</span>
          {/* Editable HERE, where the garment is on screen beside them. The
              table below edits the same fields through the same endpoint; this
              exists so committing a price does not mean leaving the picture. */}
          <div className="rb-fields">
            {EDITABLE.map((col) => (
              <label key={col.key}>
                <span>{col.label}</span>
                {editable ? (
                  <Field col={col} value={sel[col.key]} busy={saving === sel.id}
                         onCommit={(f, v) => save(sel, f, v)} />
                ) : (
                  <b className="rb-derived">{sel[col.key] ?? "—"}</b>
                )}
              </label>
            ))}
            <label>
              <span>Margen</span>
              {/* Never editable and never zero: the engine computes it, and
                  only when there is a cost to compute it from. */}
              <b className="rb-derived">
                {sel.financials?.computable ? pct(sel.financials.margin_pct) : "no calculable"}
              </b>
            </label>
          </div>
          {!editable && (
            <p className="rb-locked">
              <Icon name="lock" /> v{version.version_number} está aprobada y es
              inmutable. Para cambiar un número, abrí una versión nueva desde la tabla.
            </p>
          )}
          {saveError && <p className="rb-flag bad"><Icon name="warn" /> {saveError}</p>}
        </div>
        <div className="rb-detail-risk">
          <span className="ax-label">Estado</span>
          {selFlags.length === 0 ? (
            <p className="rb-clean"><Icon name="check" /> Sin bloqueos ni advertencias en esta fila.</p>
          ) : (
            selFlags.map((f, i) => (
              <p key={i} className={f.tone === "bad" ? "rb-flag bad" : "rb-flag warn"}>
                {/* `planning.py` speaks English by design — the Range grid has
                    rendered its codes that way since 0032. blockerText
                    translates what we know and falls back to the engine's own
                    words, so a new rule degrades to English, never to a blank. */}
                <Icon name="warn" /> {blockerText(f)}
              </p>
            ))
          )}
        </div>
      </article>

      <div className="rb-dist">
        <Share icon="grid" label="Origen del rango" parts={dist.carry} total={slots.length} />
        <Share icon="check" label="Asignación de concepto" parts={dist.concept} total={slots.length} />
        <Share icon="coin" label="Costeo" parts={dist.cost} total={slots.length} />
        <div className="rb-money">
          <span className="ax-label">Compromiso</span>
          <dl>
            <dt>Unidades</dt><dd>{t.planned_units?.toLocaleString("es-AR")}</dd>
            <dt>Inversión</dt><dd>{money(t.planned_investment, cur) || "—"}</dd>
            <dt>Presupuesto</dt><dd>{money(t.budget, cur) || "sin definir"}</dd>
            <dt>Open-to-buy</dt><dd>{money(t.open_to_buy_remaining, cur) || "no calculable"}</dd>
          </dl>
        </div>
      </div>
    </section>
  );
}
