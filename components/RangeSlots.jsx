"use client";
// The assortment-slot surface — the Range Plan's commercial half, running on
// the server-owned rows (engine migration 0032, ROADMAP §4).
//
// THE RULE THIS SCREEN OBEYS: no financial rule is reimplemented here. Every
// total, margin, open-to-buy, blocker and warning on screen is read from the
// engine's response. A second implementation in React is a second answer, and
// the number a buyer commits cash against has to be the server's — so this
// component renders `version.totals` and `version.readiness` and computes
// nothing of its own.
//
// It also never claims a save the server did not acknowledge, and it shows the
// engine's refusal verbatim: when a plan cannot be approved, WHY is the useful
// part.
import { Fragment, useCallback, useEffect, useRef, useState } from "react";

import TasteTeam from "@/components/TasteTeam";
import {
  addSlot, approvePlanVersion, createPlanVersion, deleteSlot, getPlanVersion,
  isStale, listPlanVersions, patchSlot, submitPlanVersion,
} from "@/lib/collectionPlans";
import { createTechPack, getConceptCovers, getTechPacks } from "@/lib/api";
import { getBrief } from "@/lib/collectionBrief";
import { getDirection } from "@/lib/direction";
import {
  approvedMarginTarget, bandsOfDirection, priceGuidance,
} from "@/lib/priceFromMargin";
import { buildBoard, CARRYOVER_ES, TIER_ES } from "@/lib/rangeBoard";
import { packStateForSlot } from "@/lib/techPackState";

// Columns a merchandiser edits. Order is the order they think in: what it is,
// what it costs, whether it can be made.
const COLUMNS = [
  { key: "slot_code", label: "Código", width: 92 },
  { key: "category", label: "Categoría", width: 110 },
  { key: "carryover_type", label: "Tipo", width: 96, select: ["", "carryover", "new", "variation"] },
  // Where it came from (above) and what job it does (here) are separate axes.
  // "" is a real choice, not a placeholder: it means the merchandiser has not
  // declared a tier, and nothing infers one.
  { key: "tier", label: "Rol", width: 88, select: ["", "hero", "core", "fashion", "entry"] },
  { key: "retail_price", label: "PVP", width: 96, num: true },
  { key: "landed_cost", label: "Costo", width: 96, num: true },
  { key: "planned_units", label: "Unidades", width: 84, num: true },
  { key: "moq_units", label: "MOQ", width: 74, num: true },
  { key: "lead_time_days", label: "Lead (d)", width: 78, num: true },
  { key: "delivery_date", label: "Entrega", width: 118, date: true },
];

const STATUS_LABEL = {
  draft: "Borrador", in_review: "En revisión",
  approved: "Aprobado", superseded: "Reemplazado",
};

// Server sends exact decimals as strings. Format for reading WITHOUT parsing to
// a float — the string is the accurate value, a Number() would undo the reason
// the column is NUMERIC.
function money(value, currency) {
  if (value === null || value === undefined) return "—";
  const [whole, frac = "00"] = String(value).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${currency ? currency + " " : ""}${grouped},${frac}`;
}

const pct = (v) => (v === null || v === undefined ? "—" : `${v}%`);

// ⚠ THE ONE ARITHMETIC THIS SCREEN DOES, AND WHY IT IS NOT A SECOND ANSWER.
//
// Everything else here is the engine's: totals, margins, open-to-buy, blockers.
// This is different in kind. It computes NO stored quantity — it answers the
// question the product never answered, "what should I charge?", from numbers the
// designer herself declared:
//
//     precio = costo / (1 − margen/100)
//
// Nothing is written by computing it. The number is shown, labelled with WHICH
// margin it used, and filled into the PVP cell only when she presses the button;
// from that moment the engine owns the margin it produces, exactly as before. An
// untouched price stays empty — a prefill would be Atelier deciding her price
// and calling it her decision.
//
// The formula lives in lib/priceFromMargin.mjs, in BigInt integer arithmetic,
// because `Number(cost) / 0.42` is a different discipline wearing the same
// digits. Rounding to 2 places happens once, at the end: that is the display
// precision AND NUMERIC(14,2), what the engine stores.
const MARGIN_SOURCE_ES = {
  slot: "declarado en esta fila",
  band: "banda de precio de la categoría",
  brief: "brief aprobado",
};

/** "$1.000,00 – $3.000,00" from whichever bounds the band actually declares. A
 *  band with only a floor says only a floor. */
function bandRange(band, currency) {
  const cur = band.currency || currency;
  const parts = [];
  if (band.floor_price != null) parts.push(`piso ${money(band.floor_price, cur)}`);
  if (band.ceiling_price != null) parts.push(`techo ${money(band.ceiling_price, cur)}`);
  return parts.join(" · ");
}

/** What one row can say about its price. Every branch either states a number
 *  with its provenance, or names the input that is missing and stops. */
function PriceHint({ guidance, editable, busy, onFill }) {
  const g = guidance;
  if (!g || g.state === "loading") return null;

  if (g.state === "unknown") {
    return <span className="rs-sug-miss">
      No pudimos leer el brief ni la dirección de esta colección: sin el margen
      objetivo no derivamos ningún precio.
    </span>;
  }
  if (g.state === "no_cost") {
    return <span className="rs-sug-miss">
      Falta el <b>costo</b> de esta fila: no hay número del que derivar un precio.
    </span>;
  }
  if (g.state === "no_margin") {
    return <span className="rs-sug-miss">
      Falta el <b>margen objetivo</b>: esta fila no declara uno,{" "}
      {g.hasBand
        ? `la banda de ${g.category} tampoco`
        : g.category
          ? `no hay banda de precio para ${g.category}`
          : "esta fila no tiene categoría con la que buscar una banda"}{" "}
      y el brief aprobado no fija ninguno. Sin ese número no hay precio que
      derivar, y no inventamos uno.
    </span>;
  }
  if (g.state === "margin_100") {
    return <span className="rs-sug-miss">
      El margen objetivo declarado es {g.marginPct}%: un margen de 100% o más no
      define ningún precio.
    </span>;
  }
  if (g.state === "bad_input") {
    return <span className="rs-sug-miss">
      No pudimos leer el costo o el margen guardados en esta fila, así que no
      derivamos nada.
    </span>;
  }

  const place = g.placement || { state: "no_band" };
  const band = place.band;
  const cat = g.category;

  return (
    <>
      <span className="rs-sug-lead">
        Para tu margen objetivo de {g.marginPct}% ({MARGIN_SOURCE_ES[g.marginSource]}),
        tu costo implica{" "}
      </span>
      <b className="rs-sug-fig">{money(g.price, g.currency)}</b>
      {!g.exact && (
        <span className="rs-sug-note">
          {" "}Redondeado a 2 decimales solo para mostrar; el motor guarda 2
          decimales.
        </span>
      )}

      {place.state === "no_band" && (
        <span className="rs-sug-band">
          {cat
            ? `Todavía no hay banda de precio para ${cat}: no podemos decir dónde cae.`
            : "Esta fila no tiene categoría: no hay banda con la que compararlo."}
        </span>
      )}
      {place.state === "no_bounds" && (
        <span className="rs-sug-band">
          La banda de {cat} no declara piso ni techo: no hay contra qué compararlo.
        </span>
      )}
      {place.state === "currency_mismatch" && (
        <span className="rs-sug-band">
          La banda de {cat} está en {band.currency} y esta fila en{" "}
          {g.currency || "otra moneda"}: sin un tipo de cambio registrado no hay
          comparación posible.
        </span>
      )}
      {place.state === "inside" && (
        <span className="rs-sug-band">
          Cae dentro de tu banda de {cat} ({bandRange(band, g.currency)}).
        </span>
      )}
      {place.state === "below_floor" && (
        <span className="rs-sug-band out">
          Cae por debajo de tu piso de {cat} ({money(band.floor_price, band.currency || g.currency)}):
          tu costo y tu propia banda no coinciden.
        </span>
      )}
      {place.state === "above_ceiling" && (
        <span className="rs-sug-band out">
          Cae por encima de tu techo de {cat} ({money(band.ceiling_price, band.currency || g.currency)}):
          tu costo y tu propia banda no coinciden.
        </span>
      )}

      {/* ⚠ AN ACTION SHE TAKES. Never a prefill, never a default — the field
          stays empty until this is pressed. */}
      {g.matchesCurrent === true && (
        <span className="rs-sug-note">El PVP cargado ya es este número.</span>
      )}
      {editable && g.matchesCurrent !== true && (
        <button className="rs-sug-fill" disabled={busy}
                title="Escribe este número en la celda PVP de esta fila. No se guarda nada hasta que lo pulses."
                onClick={() => onFill(g.price)}>
          {g.matchesCurrent === null
            ? "Completar PVP con este número"
            : "Reemplazar el PVP por este número"}
        </button>
      )}
    </>
  );
}

// A cell keeps its own draft while it is being typed in and commits on blur or
// Enter. Saving from onChange sent a request per keystroke: "12000" was five
// writes, responses could arrive out of order, and a fast second edit could
// resend the first's stale row and reverse it (2026-07-24 review, P1).
//
// Escape abandons the draft — a merchandiser who mistypes into a price column
// needs a way out that is not "undo it by hand".
function Cell({ col, value, disabled, onCommit }) {
  const [draft, setDraft] = useState(null);
  const editing = draft !== null;
  const shown = editing ? draft : (value ?? "");

  if (col.select) {
    // A select has no intermediate state to protect: one interaction, one value.
    return (
      <select className="rs-in" value={value ?? ""} disabled={disabled}
              onChange={(e) => onCommit(e.target.value || null)}>
        {col.select.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
      </select>
    );
  }

  const commit = () => {
    if (!editing) return;
    const next = draft === "" ? null : draft;
    setDraft(null);
    // Nothing changed: do not spend a write, and do not flash a "saved" that
    // did not happen.
    if (String(next ?? "") !== String(value ?? "")) onCommit(next);
  };

  return (
    <input className={`rs-in${col.num ? " num" : ""}`}
           type={col.date ? "date" : "text"}
           value={shown} disabled={disabled}
           onChange={(e) => setDraft(e.target.value)}
           onBlur={commit}
           onKeyDown={(e) => {
             if (e.key === "Enter") { commit(); e.currentTarget.blur(); }
             if (e.key === "Escape") { setDraft(null); e.currentTarget.blur(); }
           }} />
  );
}

// ⚠ A SLOT CODE IS A STYLE CODE, NOT A ROW NUMBER (owner walkthrough
// 2026-08-12, STYLE-DECISIONS.md D9).
//
// This button generated `S-1`, `S-2` — positional labels, unique only within
// one plan version. That would be harmless if the code stayed on this screen.
// It does not: `tech_pack.py` sets `style_number = slot.slot_code` and versions
// tech packs on `(brand_id, style_number)`. Two collections each producing an
// `S-1` therefore chain two unrelated garments into ONE brand-wide tech-pack
// version sequence.
//
// Live Complot data is all proper codes (COM-PANT-01 …), so nothing is broken
// today — it breaks the first time somebody adds a row by hand and generates a
// pack from it. The generated code now inherits the brand's own convention from
// the codes already in the plan, and never repeats one this plan holds.
//
// ⚠ THIS IS A MITIGATION, NOT THE FIX, and the distinction matters. Two
// collections that both start from an EMPTY plan still both generate
// `ESTILO-01` — this function only sees the current plan's rows, so it cannot
// know what the rest of the brand uses.
//
// And no amount of client cleverness closes it, because `slot_code` can never
// be brand-unique: a plan revision deliberately copies every row forward with
// the SAME code, so v1 and v2 both hold `COM-PANT-01` by design. A key that is
// required to repeat cannot also be a brand-wide identity.
//
// That is the real argument for STYLE-DECISIONS.md D1: the tech pack must chain
// on `style_id`, not on this string. Until then this narrows the window; it
// does not close it. The durable answer is a person naming the style, which is
// what the CÓDIGO column input is for.
function nextSlotCode(slots) {
  // Learn the prefix from what this plan already uses: COM-PANT-01 -> COM-PANT.
  const coded = slots.map((s) => s.slot_code || "").filter(Boolean);
  const withTail = coded
    .map((c) => /^(.*?)-?(\d+)$/.exec(c))
    .filter(Boolean);

  const prefix = withTail.length
    ? withTail[withTail.length - 1][1]
    : "ESTILO";

  const taken = new Set(coded);
  const sameFamily = withTail
    .filter((m) => m[1] === prefix)
    .map((m) => Number(m[2]))
    .filter(Number.isFinite);
  let n = (sameFamily.length ? Math.max(...sameFamily) : 0) + 1;

  // Never hand back a code the plan already holds — the engine 409s on a
  // duplicate within a version, and across versions a silent reuse is the bug
  // this whole function exists to prevent.
  let code = `${prefix}-${String(n).padStart(2, "0")}`;
  while (taken.has(code)) {
    n += 1;
    code = `${prefix}-${String(n).padStart(2, "0")}`;
  }
  return code;
}

// `onVersion` lifts the loaded version to the parent. The Range screen used to
// compute its headline stats and its visual assortment from the LOCAL studio
// cards while this component showed the server's rows, and called them "the
// same object" in copy — so the screen could say "1 estilo" above a financial
// plan with zero rows. Two representations of one thing must never disagree,
// so there is now one: these slots.
export default function RangeSlots({ brandId, planId, currency = "ARS",
                                     onVersion, onNavigate, collectionId = null }) {
  const [version, setVersion] = useState(null);
  const [state, setState] = useState({ loading: true, error: null });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [refusal, setRefusal] = useState(null);
  // ⚠ ONE request for the whole grid, mapped by slot_id — not one per row.
  // undefined = not asked · null = could not ask · [] = the engine said none.
  const [packs, setPacks] = useState(undefined);
  const [creatingFor, setCreatingFor] = useState(null);
  // "board" = the merchandising view (categories x delivery windows);
  // "table" = the editable grid. The GRID stays the only place a value is
  // edited: two editable surfaces over one row is how they disagree.
  const [view, setView] = useState("board");
  const [covers, setCovers] = useState(null);

  // Concept covers, so a planned slot can show the design it points at. Keyed
  // by concept_id — a slot with no concept shows its absence, never a stock
  // image standing in for a garment nobody has drawn.
  const loadCovers = useCallback(async () => {
    if (!brandId || !collectionId) return;
    const d = await getConceptCovers(brandId, collectionId, 60);
    setCovers(Array.isArray(d?.covers) ? d.covers : null);
  }, [brandId, collectionId]);
  useEffect(() => { loadCovers(); }, [loadCovers]);

  const loadPacks = useCallback(async () => {
    if (!brandId) return;
    setPacks(await getTechPacks(brandId));
  }, [brandId]);
  useEffect(() => { loadPacks(); }, [loadPacks]);

  // The two declarations a price can be derived FROM: the approved brief's
  // margin target and the direction's per-category price bands. Both are read
  // straight from the engine — this screen keeps no mirror of either.
  //
  // ⚠ "COULD NOT ASK" IS NOT "SHE DECLARED NOTHING". A failed read becomes
  // `unknown`, which says so; only an engine that answered can produce a
  // "falta el margen objetivo". Collapsing the two would turn an outage into an
  // accusation that she left a field empty.
  const [pricing, setPricing] = useState({ status: "loading" });
  const pricingGen = useRef(0);
  useEffect(() => {
    const mine = ++pricingGen.current;
    if (!brandId || !collectionId) {
      // No collection means no brief and no direction to read. Say nothing
      // rather than report a missing margin nobody was asked for.
      setPricing({ status: "unknown" });
      return;
    }
    setPricing({ status: "loading" });
    (async () => {
      const [brief, direction] = await Promise.all([
        getBrief(brandId, collectionId).catch(() => "unreachable"),
        getDirection(brandId, collectionId).catch(() => "unreachable"),
      ]);
      if (mine !== pricingGen.current) return;
      if (brief === "unreachable" || direction === "unreachable") {
        setPricing({ status: "unknown" });
        return;
      }
      setPricing({
        status: "ready",
        marginPct: approvedMarginTarget(brief),
        bands: bandsOfDirection(direction),
      });
    })();
  }, [brandId, collectionId]);

  // ⚠ IDEMPOTENT BY GUARD, because the engine has no idempotency key here.
  // A double click or a click-then-reload would otherwise mint a SECOND root
  // pack for one slot, and nothing downstream could say which was canonical.
  // The button disables while pending AND the pack list is re-read before the
  // navigation, so returning to the range shows the new state immediately.
  async function createPack(slot) {
    if (creatingFor) return;
    setCreatingFor(slot.id);
    setRefusal(null);
    try {
      const pack = await createTechPack(brandId, slot.id);
      await loadPacks();
      onNavigate?.(`techpack:${pack.id}`);
    } catch (e) {
      setRefusal(e.payload || e.message || "no pudimos crear la ficha");
      await loadPacks();   // a 409 means it already exists — show the truth
    }
    setCreatingFor(null);
  }
  // The panel is convened ON DEMAND, for one row. Running it for every slot on
  // load would turn a grid into a wall of opinions nobody asked for — and the
  // question "what does the team think about THIS one" is asked about one row
  // at a time.
  const [conveneFor, setConveneFor] = useState(null);

  // ⚠ THIS LOADER CAN WRITE, WHICH MAKES THE RACE WORSE HERE (owner review,
  // 2026-08-14). It has no cancellation, and on a plan with no version yet it
  // calls `createPlanVersion` — so a load for the collection you just left can
  // MINT A VERSION on that plan after you have moved on, and then hand the grid
  // a `version` whose slot ids belong to it. Every subsequent `saveCell` patches
  // the wrong collection's rows.
  //
  // The write is checked before AND after: nothing is created for a superseded
  // request, and nothing a superseded request created is adopted into state.
  const generation = useRef(0);

  const load = useCallback(async () => {
    const mine = ++generation.current;
    if (!brandId || !planId) {
      setState({ loading: false, error: null });
      return;
    }
    setState({ loading: true, error: null });
    try {
      // Ask which version is open and which governs, rather than inferring it
      // from a 409. Show the open one when there is one — that is where work
      // happens; otherwise the approved one, read-only.
      const { items = [], open_version_id, approved_version_id } =
        await listPlanVersions(brandId, planId);
      if (mine !== generation.current) return;
      const wanted = open_version_id || approved_version_id || items[0]?.id || null;
      if (!wanted) {
        // No version yet: open v1 so the plan has somewhere to put its rows.
        // Checked again first — this MINTS a row, and doing that for a plan the
        // user has already navigated away from is a write nobody asked for.
        if (mine !== generation.current) return;
        const created = await createPlanVersion(brandId, planId, { currency });
        if (mine !== generation.current) return;
        setVersion(created);
      } else {
        const found = items.find((v) => v.id === wanted)
                   || await getPlanVersion(brandId, wanted);
        if (mine !== generation.current) return;
        setVersion(found);
      }
      setState({ loading: false, error: null });
    } catch (e) {
      if (mine !== generation.current) return;
      setState({ loading: false, error: String(e.message || e) });
    }
  }, [brandId, planId, currency]);

  useEffect(() => { load(); }, [load]);

  // Report upward whenever the server's answer changes, so the parent never
  // has to derive its own.
  useEffect(() => { onVersion?.(version); }, [version, onVersion]);

  // Someone else changed the plan while this screen was showing an older one.
  // The only honest move is to reload and let the person decide against what it
  // says NOW — retrying would apply a decision taken about a different plan.
  const STALE = "Alguien más cambió este plan mientras lo tenías abierto. "
              + "Se recargó: revisá los números antes de seguir.";

  async function run(fn, ok) {
    setBusy(true); setNotice(""); setRefusal(null);
    try {
      const next = await fn();
      if (next && next.slots) setVersion(next);
      else if (version) setVersion(await getPlanVersion(brandId, version.id));
      setNotice(ok);
    } catch (e) {
      if (e.detail && e.detail.blockers) setRefusal(e.detail);
      else if (isStale(e)) { setNotice(STALE); await load(); }
      else setNotice(`El motor rechazó la acción: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  if (state.loading) return <p className="rs-empty">Cargando el plan…</p>;
  if (!brandId) {
    return <p className="rs-empty">
      Las filas del plan viven en el motor. Sin conexión no se pueden ver ni editar.
    </p>;
  }
  if (state.error) return <p className="rs-empty">No se pudo leer el plan: {state.error}</p>;
  if (!version) return <p className="rs-empty">Este plan todavía no tiene versión.</p>;

  const editable = version.status === "draft" || version.status === "in_review";
  const t = version.totals || {};
  const r = version.readiness || { blockers: [], warnings: [] };

  // ONE field, not the row. The server returns the recomputed totals and
  // readiness with it, so the screen stays consistent without refetching — and
  // without ever computing a total of its own.
  async function saveCell(slot, field, value) {
    setNotice(""); setRefusal(null);
    try {
      // The plan's REVISION, not its version number: the number that moves when
      // a colleague edits the row above this one. The response carries the
      // revision this write produced, so the next cell cites the state this one
      // left behind rather than the state the page loaded with.
      const res = await patchSlot(brandId, slot.id, { [field]: value },
                                  version.revision);
      setVersion((v) => ({
        ...v,
        revision: res.plan_revision,
        slots: v.slots.map((s) => (s.id === res.slot.id ? res.slot : s)),
        totals: res.totals, readiness: res.readiness,
      }));
    } catch (e) {
      if (isStale(e)) { setNotice(STALE); await load(); }
      else setNotice(`El motor rechazó el cambio: ${e.message}`);
    }
  }

  return (
    <div className="rs">
      <div className="rs-head">
        <span className={`rs-status ${version.status}`}>
          {STATUS_LABEL[version.status] || version.status}
        </span>
        {/* The revision is shown, not hidden: it is how someone notices the
            plan moved under them before the engine has to tell them. */}
        <span className="rs-vers" title="Versión del plan · cambios registrados">
          v{version.version_number}
          {version.revision != null && <em> · rev {version.revision}</em>}
        </span>
        {version.approved_by && (
          <span className="rs-approver">
            Aprobó {version.approved_by}
            {version.approved_by_verified ? " · verificado" : " · sin verificar"}
          </span>
        )}
      </div>

      {notice && <div className="rs-notice">{notice}</div>}

      {/* The engine's refusal, verbatim. Why a plan cannot be approved is the
          useful part — a generic error would make the gate worthless. */}
      {refusal && (
        <div className="rs-refusal">
          <b>El motor no aprobó el plan.</b>
          <ul>
            {refusal.blockers.map((b, i) => (
              <li key={i}>{b.slot ? <code>{b.slot}</code> : null} {b.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="rs-totals">
        <div className="rs-t"><b>{money(t.gross_sales, t.currency)}</b><span>Venta bruta</span></div>
        <div className="rs-t"><b>{money(t.gross_cost, t.currency)}</b><span>Costo</span></div>
        <div className="rs-t"><b>{pct(t.margin_pct)}</b><span>Margen</span></div>
        <div className="rs-t"><b>{money(t.open_to_buy_remaining, t.currency)}</b><span>Open-to-buy</span></div>
        <div className="rs-t"><b>{t.planned_units ?? "—"}</b><span>Unidades</span></div>
        <div className="rs-t"><b>{pct(t.newness_pct)}</b><span>Newness</span></div>
      </div>
      <p className="rs-src">
        Calculado por el motor con decimales exactos — esta pantalla no recalcula
        nada.
        {t.slots_without_financials > 0 && (
          <> <b>{t.slots_without_financials} fila(s) sin precio o costo quedaron
          fuera del total</b> — un dato que falta no es cero.</>
        )}
        {t.mixed_currencies && (
          <> <b>No hay total posible: el plan mezcla {t.mixed_currencies.join(" y ")}</b> sin
          un tipo de cambio registrado.</>
        )}
      </p>

      {(r.blockers.length > 0 || r.warnings.length > 0) && (
        <div className="rs-issues">
          {r.blockers.map((b, i) => (
            <div key={`b${i}`} className="rs-issue block">
              <span>bloquea</span>{b.slot ? <code>{b.slot}</code> : null}{b.message}
            </div>
          ))}
          {r.warnings.map((w, i) => (
            <div key={`w${i}`} className="rs-issue warn">
              <span>aviso</span>{w.slot ? <code>{w.slot}</code> : null}{w.message}
            </div>
          ))}
        </div>
      )}

      {/* ── The merchandising board: category rows x delivery windows ──────
          Columns are REAL delivery months off each slot's stored date, and a
          slot without one gets a "Sin entrega" column rather than a guess.
          An empty cell states an absence and nothing more: the reference
          mock's "HUECO DETECTADO — falta vestido de ocasión" is a
          merchandising inference no engine source backs. */}
      <div className="rs-viewbar">
        <div className="rs-seg">
          <button className={view === "board" ? "on" : ""} onClick={() => setView("board")}>Visual</button>
          <button className={view === "table" ? "on" : ""} onClick={() => setView("table")}>Tabla</button>
        </div>
        <span className="rs-viewnote">
          {view === "board"
            ? "Vista de surtido — se edita en Tabla."
            : "Cada celda guarda al salir; el motor recalcula los totales."}
        </span>
      </div>

      {view === "board" && (() => {
        const board = buildBoard(version.slots);
        const coverFor = (slot) => (covers || []).find((c) => c.concept_id === slot.concept_id);
        if (!board.rows.length) {
          return <div className="rs-board-empty">Sin filas todavía. Un plan sin
            surtido no compromete nada.</div>;
        }
        return (
          <div className="rs-board-wrap">
            <table className="rs-board">
              <thead>
                <tr>
                  <th className="rs-b-cat">Categoría</th>
                  {board.columns.map((c) => <th key={c.key}>{c.label}</th>)}
                  <th className="rs-b-tot">Total</th>
                </tr>
              </thead>
              <tbody>
                {board.rows.map((row) => (
                  <tr key={row.category}>
                    <th className="rs-b-cat">
                      <b>{row.category}</b>
                      <span>{row.count} {row.count === 1 ? "fila" : "filas"}</span>
                    </th>
                    {row.cells.map((cell) => (
                      <td key={cell.window.key}>
                        {cell.slots.length === 0 ? (
                          <span className="rs-b-none">—</span>
                        ) : cell.slots.map((sl) => {
                          const cov = coverFor(sl);
                          const st = packStateForSlot(packs, sl.id);
                          return (
                            <div className="rs-b-card" key={sl.id}
                                 title={`${sl.slot_code || ""} ${sl.style_intent || ""}`.trim()}>
                              <div className="rs-b-fig">
                                {cov?.image_data_uri
                                  ? <img src={cov.image_data_uri} alt={cov.name || sl.slot_code} />
                                  : <span className="rs-b-nofig">sin concepto</span>}
                              </div>
                              <div className="rs-b-body">
                                <div className="rs-b-code">{sl.slot_code || "sin código"}</div>
                                <div className="rs-b-name">{sl.style_intent || cov?.name || "sin descripción"}</div>
                                <div className="rs-b-nums">
                                  <span>{sl.planned_units ?? "—"} u.</span>
                                  <span>{money(sl.retail_price, sl.currency)}</span>
                                  <span className={sl.financials?.margin_pct == null ? "dim" : ""}>
                                    {pct(sl.financials?.margin_pct)}
                                  </span>
                                </div>
                                <div className="rs-b-tags">
                                  {sl.carryover_type && (
                                    <span className="rs-b-tag">{CARRYOVER_ES[sl.carryover_type] || sl.carryover_type}</span>
                                  )}
                                  {sl.tier && (
                                    <span className="rs-b-tag tier">{TIER_ES[sl.tier] || sl.tier}</span>
                                  )}
                                  {st.kind !== "none" && st.kind !== "loading" && st.packId && (
                                    <button className="rs-b-tag link"
                                            onClick={() => onNavigate?.(`techpack:${st.packId}`)}>
                                      ficha
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </td>
                    ))}
                    <td className="rs-b-tot">
                      <b>{row.units ?? "—"} u.</b>
                      <span>{row.mixedCurrencies
                        ? "sin total: mezcla monedas"
                        : money(row.sales, row.currency)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}

      {view === "table" && (
      <div className="rs-wrap">
        <table className="rs-table">
          <thead>
            <tr>
              {COLUMNS.map((c) => <th key={c.key} style={{ width: c.width }}>{c.label}</th>)}
              <th>Venta</th><th>Margen</th><th>Ficha técnica</th><th />
            </tr>
          </thead>
          <tbody>
            {version.slots.map((slot) => {
              const fin = slot.financials || {};
              // Her own numbers, or the name of the one that is missing. Never
              // a default margin: see the note above PriceHint.
              const guidance = pricing.status === "loading"
                ? { state: "loading" }
                : priceGuidance({
                    slot,
                    bands: pricing.bands,
                    briefMarginPct: pricing.marginPct,
                    available: pricing.status === "ready",
                  });
              return (
                <Fragment key={slot.id}>
                <tr>
                  {COLUMNS.map((c) => (
                    <td key={c.key}>
                      {/* `busy` no longer disables the grid: a slow save on
                          one row must not freeze every other cell. */}
                      <Cell col={c} value={slot[c.key]} disabled={!editable}
                            onCommit={(v) => saveCell(slot, c.key, v)} />
                    </td>
                  ))}
                  <td className="rs-num">{money(fin.gross_sales, slot.currency)}</td>
                  <td className="rs-num">{pct(fin.margin_pct)}</td>
                  <td className="rs-pack">{(() => {
                    const st = packStateForSlot(packs, slot.id);
                    if (st.kind === "loading") return <span className="rs-pack-dim">…</span>;
                    if (st.kind === "unknown") return <span className="rs-pack-dim" title="La consulta de fichas falló. No sabemos si esta fila tiene una.">{st.label}</span>;
                    if (st.kind === "none") {
                      return (
                        <button className="rs-pack-new" disabled={!!creatingFor}
                                title="Crea la ficha desde esta fila: hereda categoría, cantidad, precio objetivo, MOQ y entrega"
                                onClick={() => createPack(slot)}>
                          {creatingFor === slot.id ? "Creando…" : "Crear ficha técnica"}
                        </button>
                      );
                    }
                    return (
                      <button className={`rs-pack-open ${st.tone}`}
                              title="Abrir esta ficha exactamente — no la primera de la marca"
                              onClick={() => onNavigate?.(`techpack:${st.packId}`)}>
                        {st.label}
                      </button>
                    );
                  })()}</td>
                  <td>
                    <button className="rs-team"
                            title="Convocar al equipo de criterio para esta fila"
                            onClick={() => setConveneFor(
                              conveneFor === slot.id ? null : slot.id)}>
                      {conveneFor === slot.id ? "×" : "⚖"}
                    </button>
                    {editable && (
                      <button className="rs-del" disabled={busy}
                              onClick={() => run(
                                () => deleteSlot(brandId, slot.id, version.revision),
                                "Fila eliminada.")}>×</button>
                    )}
                  </td>
                </tr>
                {/* The price question, under the row it is about. A cell 96px
                    wide cannot hold a sentence, and this needs a sentence:
                    the number is only honest with its provenance attached. */}
                {guidance.state !== "loading" && (
                  <tr className="rs-sug">
                    <td className="rs-sug-cell" colSpan={COLUMNS.length + 4}>
                      <PriceHint guidance={guidance} editable={editable} busy={busy}
                                 onFill={(price) => saveCell(slot, "retail_price", price)} />
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
            {!version.slots.length && (
              <tr><td colSpan={COLUMNS.length + 4} className="rs-empty-row">
                Sin filas. Un plan sin surtido no compromete nada.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      {/* One row at a time, under the grid rather than inside it: the panel is
          a paragraph of disagreement, and a table cell is the wrong shape for
          it. */}
      {conveneFor && <TasteTeam slotId={conveneFor} />}

      <div className="rs-actions">
        {editable && (
          <button disabled={busy}
                  onClick={() => run(
                    () => addSlot(brandId, version.id,
                                  { slot_code: nextSlotCode(version.slots),
                                    carryover_type: "new" },
                                  version.revision),
                    "Fila agregada.")}>
            Agregar fila
          </button>
        )}
        {version.status === "draft" && (
          <button disabled={busy}
                  onClick={() => run(
                    () => submitPlanVersion(brandId, version.id, version.revision),
                    "Enviado a revisión.")}>
            Enviar a revisión
          </button>
        )}
        {version.status === "in_review" && (
          <button className="rs-primary" disabled={busy}
                  onClick={() => run(
                    () => approvePlanVersion(brandId, version.id, version.revision),
                    "Plan aprobado y congelado.")}>
            Aprobar y congelar
          </button>
        )}
        {!editable && (
          <button disabled={busy}
                  onClick={() => run(
                    () => createPlanVersion(brandId, planId, {}),
                    "Se abrió la siguiente versión con las filas aprobadas.")}>
            Abrir la siguiente versión
          </button>
        )}
      </div>
    </div>
  );
}
