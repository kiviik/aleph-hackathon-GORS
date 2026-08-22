// The range plan as a merchandising board: category rows × delivery windows.
//
// Owner direction 2026-08-14, from the reference mockups: the range plan is
// the commercial center of gravity and should read as a VISUAL assortment
// board, not only a grid of inputs. This module is the pure half — grouping
// real slots into that board — so the layout is testable without a DOM.
//
// ⚠ HONESTY RULES, because a board invites decoration:
//   · Columns are DELIVERY MONTHS derived from each slot's real
//     delivery_date. The engine has no "drop" object; a month bucket is
//     presentation of a stored date, not an invented drop. No date → its own
//     "Sin entrega" column, which is a real planning hole, not a default.
//   · An empty cell states a fact ("this category has nothing in this
//     window") and NOTHING more. The mock's "falta: vestido de ocasión" is a
//     merchandising inference no engine source backs — omitted on purpose.
//   · Category totals SUM server figures (units, gross_sales). No averaged
//     margin: blending per-slot margins would be the client recomputing a
//     figure the engine owns per-slot and refuses to state per-category.

const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun",
                   "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export const NO_DELIVERY = "sin-entrega";

// "2026-11-02" -> {key: "2026-11", label: "Nov 26"} · missing -> Sin entrega
export function deliveryWindow(date) {
  if (!date || typeof date !== "string" || date.length < 7) {
    return { key: NO_DELIVERY, label: "Sin entrega" };
  }
  const [y, m] = date.split("-");
  const mi = Number(m) - 1;
  if (!(mi >= 0 && mi < 12)) return { key: NO_DELIVERY, label: "Sin entrega" };
  return { key: `${y}-${m}`, label: `${MONTHS_ES[mi]} ${y.slice(2)}` };
}

// Two DIFFERENT axes, and they were previously collapsed into one map.
//
// `carryover_type` (carryover|new|variation, migration 0032) answers WHERE A
// SLOT CAME FROM. This map used to carry a `core` key — not a legal value on
// that column — while MISSING `variation`, which is legal and which three rows
// of the golden collection use (COM-BUZO-02, COM-CAMPERA-01, COM-PANT-01).
// Those rows rendered the raw English "variation" in a Spanish UI, and the
// Tabla editor has offered `variation` as an option the whole time. The stray
// `core` was the tier concept leaking into the wrong column.
export const CARRYOVER_ES = {
  new: "nueva", carryover: "carryover", variation: "variación",
};

// `tier` (hero|core|fashion|entry, migration 0065) answers WHAT JOB IT DOES in the
// range. A carryover can be a hero. Planner-declared: absent means the
// merchandiser has not said, and it renders as nothing rather than a default.
//
// Left in the trade's own English, which is what the owner's reference mock
// itself does inside an otherwise Spanish screen.
export const TIER_ES = {
  hero: "hero", core: "core", fashion: "fashion", entry: "entry",
};

export function buildBoard(slots = []) {
  const colMap = new Map();
  const rowMap = new Map();

  for (const s of slots) {
    const w = deliveryWindow(s.delivery_date);
    if (!colMap.has(w.key)) colMap.set(w.key, w);
    const cat = s.category || "Sin categoría";
    if (!rowMap.has(cat)) {
      rowMap.set(cat, { category: cat, cells: new Map(), count: 0,
                        units: null, sales: null, currencies: new Set() });
    }
    const row = rowMap.get(cat);
    if (!row.cells.has(w.key)) row.cells.set(w.key, []);
    row.cells.get(w.key).push(s);
    row.count += 1;
    if (Number.isFinite(s.planned_units)) row.units = (row.units || 0) + s.planned_units;
    const gs = s.financials?.gross_sales;
    if (gs != null && Number.isFinite(Number(gs))) {
      // ⚠ Cross-currency totals REFUSE to exist (§4's rule, kept here): sum
      // only while every contributing slot shares one currency.
      row.currencies.add(s.currency || "?");
      row.sales = (row.sales || 0) + Number(gs);
    }
  }

  // Real months in calendar order; the no-date column LAST and only if used.
  const columns = [...colMap.values()].sort((a, b) =>
    a.key === NO_DELIVERY ? 1 : b.key === NO_DELIVERY ? -1
      : a.key.localeCompare(b.key));

  const rows = [...rowMap.values()]
    .sort((a, b) => (b.units || 0) - (a.units || 0))
    .map((r) => ({
      category: r.category,
      count: r.count,
      units: r.units,
      // One currency → an honest sum. Mixed → null, and the cell says why.
      sales: r.currencies.size === 1 ? r.sales : null,
      currency: r.currencies.size === 1 ? [...r.currencies][0] : null,
      mixedCurrencies: r.currencies.size > 1,
      cells: columns.map((c) => ({ window: c, slots: r.cells.get(c.key) || [] })),
    }));

  return { columns, rows };
}
