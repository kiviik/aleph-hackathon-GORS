// The price a designer's OWN numbers imply — arithmetic, never a market guess.
//
// ⚠ WHAT THIS IS, AND WHAT IT IS CAREFULLY NOT. Retail price is the most
// consequential number a small label picks, and Atelier only ever RECORDED it:
// `retail_price` and `landed_cost` go in, the engine computes margin out, and
// nothing helped anyone ARRIVE at the price. This module closes that — using
// only numbers she has already declared:
//
//   · `landed_cost`        on the slot                  — what it costs her
//   · `target_margin_pct`  on the slot                  — her target for THIS row
//   · `target_margin_pct`  on the direction's price band — her target for the category
//   · `margin_target`      on the APPROVED collection brief — the collection's
//
// It is not a forecast, not a comparable, not "what the market pays". It is
// `cost / (1 - margin)` on her own commitments, and every caller is expected to
// label it as exactly that. The moment a number here is presented as a
// recommendation, this file has been misused.
//
// ⚠ NO DEFAULT MARGIN, EVER. A made-up margin produces a made-up price wearing
// the authority of arithmetic. When no margin has been declared anywhere, this
// returns `no_margin` and names the three places it looked. Missing stays
// missing — the same rule the brand gate obeys when a DNA run has not happened.
//
// ⚠ NO BINARY FLOATS. The engine keeps money in `Decimal` because a buyer
// commits cash against it; `Number("12000.10") / 0.42` is a different discipline
// wearing the same digits. Everything below is integer arithmetic on BigInt
// scaled decimals, and the ONLY rounding is the final half-up to 2 places —
// which is both the display precision and NUMERIC(14,2), what the engine stores.
//
// Dependency-free (same pattern as collectionBrief.mjs / planResolution.mjs) so
// the arithmetic is testable without a DOM or a network.

// --------------------------------------------------------------------------- //
// exact decimals
// --------------------------------------------------------------------------- //

/** "12000.10" -> {v: 1200010n, s: 2}. Returns null for anything that is not a
 *  plain decimal — a value this cannot read is a value it must not compute on.
 *  Accepts the engine's strings and a screen's typed input; refuses NaN,
 *  Infinity, exponent notation and empty strings alike. */
export function parseDecimal(input) {
  if (input === null || input === undefined) return null;
  if (typeof input === "number" && !Number.isFinite(input)) return null;
  const raw = String(input).trim();
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return null;
  const neg = raw.startsWith("-");
  const [whole, frac = ""] = (neg ? raw.slice(1) : raw).split(".");
  const v = BigInt(whole + frac);
  return { v: neg ? -v : v, s: frac.length };
}

/** Both values at one scale, so they can be compared as integers. */
function align(a, b) {
  const s = Math.max(a.s, b.s);
  return [a.v * 10n ** BigInt(s - a.s), b.v * 10n ** BigInt(s - b.s)];
}

/** -1 · 0 · 1, exactly. No subtraction into a float. */
export function compareDecimal(a, b) {
  const [x, y] = align(a, b);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** A BigInt already scaled by 100 -> "28571.43". Kept as a string end to end:
 *  the string IS the accurate value, and the screen's `money()` formats it
 *  without ever calling Number(). */
function centsToString(cents) {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  const whole = abs / 100n;
  const frac = String(abs % 100n).padStart(2, "0");
  return `${neg ? "-" : ""}${whole}.${frac}`;
}

// --------------------------------------------------------------------------- //
// the one formula
// --------------------------------------------------------------------------- //

/**
 * `price = landed_cost / (1 - margin_pct/100)`, done exactly.
 *
 * Rearranged so no division happens until the last step:
 *
 *     price = cost * 100 / (100 - margin)
 *           = (cost.v * 100 * 10^margin.s) / (10^cost.s * (100*10^margin.s - margin.v))
 *
 * Returns `{ ok, price, exact }` where `price` is a 2-decimal string rounded
 * HALF-UP, and `exact` says whether that rounding lost anything — a caller that
 * shows the number must say so when it did.
 *
 * Refusals, never substitutions:
 *   · `bad_cost`   — the cost is unreadable or negative
 *   · `bad_margin` — the margin is unreadable or negative
 *   · `margin_100` — a margin of 100% or more defines no finite price
 */
export function priceForMargin(landedCost, marginPct) {
  const cost = parseDecimal(landedCost);
  const margin = parseDecimal(marginPct);
  if (!cost || cost.v < 0n) return { ok: false, reason: "bad_cost" };
  if (!margin || margin.v < 0n) return { ok: false, reason: "bad_margin" };

  const marginUnit = 10n ** BigInt(margin.s);          // 100% expressed at margin's scale
  const denom = 10n ** BigInt(cost.s) * (100n * marginUnit - margin.v);
  if (denom <= 0n) return { ok: false, reason: "margin_100" };

  const numer = cost.v * 100n * marginUnit;
  // Scale to cents BEFORE dividing, then round half-up on the remainder. This
  // is the only rounding in the module.
  const scaled = numer * 100n;
  let cents = scaled / denom;
  const rest = scaled % denom;
  if (rest * 2n >= denom) cents += 1n;

  return { ok: true, price: centsToString(cents), exact: rest === 0n };
}

// --------------------------------------------------------------------------- //
// where that number falls in her own band
// --------------------------------------------------------------------------- //

/**
 * Place a price inside the direction's band for a category.
 *
 * ⚠ A CURRENCY MISMATCH IS REFUSED, NOT CONVERTED — the same stance the engine
 * takes in `reconcile_price_bands`. Inventing a rate to make two numbers
 * comparable is inventing the comparison.
 *
 * States: `no_band` · `no_bounds` · `currency_mismatch` · `below_floor` ·
 * `inside` · `above_ceiling`.
 */
export function placeInBand(price, band, currency = null) {
  if (!band) return { state: "no_band" };
  const p = parseDecimal(price);
  if (!p) return { state: "no_band" };

  if (band.currency && currency && band.currency !== currency) {
    return { state: "currency_mismatch", band };
  }

  const floor = parseDecimal(band.floor_price);
  const ceiling = parseDecimal(band.ceiling_price);
  if (!floor && !ceiling) return { state: "no_bounds", band };

  if (floor && compareDecimal(p, floor) < 0) return { state: "below_floor", band };
  if (ceiling && compareDecimal(p, ceiling) > 0) return { state: "above_ceiling", band };
  return { state: "inside", band };
}

/** The band for a category, matched the way a person would: exact name first,
 *  then case- and space-insensitively. Never a fuzzy match — a band for
 *  "Camisas" must not answer for "Camisetas". */
export function bandForCategory(bands, category) {
  const cat = String(category ?? "").trim();
  if (!cat || !Array.isArray(bands)) return null;
  const norm = (s) => String(s ?? "").trim().toLowerCase();
  return bands.find((b) => b.category === cat)
      || bands.find((b) => norm(b.category) === norm(cat))
      || null;
}

// --------------------------------------------------------------------------- //
// the whole verdict for one row
// --------------------------------------------------------------------------- //

/**
 * Everything a row needs to say, decided here so the screen only chooses words.
 *
 * `marginSource` is part of the answer, not decoration: "58% because your
 * approved brief says so" and "58% because you typed it into this row" are
 * different claims, and the screen must be able to name which one it used.
 *
 * Precedence is most-specific-first — the row she declared, then the category
 * band she declared, then the collection brief she approved. None of the three
 * is invented, so whichever answers, the number remains hers.
 *
 * `state`:
 *   · `unknown`      — the brief/direction could not be read. Not "no margin".
 *   · `no_cost`      — nothing to derive a price FROM.
 *   · `no_margin`    — no margin declared in any of the three places.
 *   · `margin_100`   — a declared margin of 100%+ defines no price.
 *   · `bad_input`    — a stored value this cannot read; says so rather than guessing.
 *   · `ok`           — `price`, `exact`, `marginPct`, `marginSource`, `band`.
 */
export function priceGuidance({ slot, bands, briefMarginPct, available = true }) {
  if (!available) return { state: "unknown" };

  const cost = slot?.landed_cost;
  if (cost === null || cost === undefined || String(cost).trim() === "") {
    return { state: "no_cost" };
  }

  const category = slot?.category || null;
  const band = bandForCategory(bands, category);

  const candidates = [
    ["slot", slot?.target_margin_pct],
    ["band", band?.target_margin_pct],
    ["brief", briefMarginPct],
  ];
  const chosen = candidates.find(([, v]) =>
    v !== null && v !== undefined && String(v).trim() !== "");

  if (!chosen) return { state: "no_margin", category, band, hasBand: !!band };

  const [marginSource, marginPct] = chosen;
  const result = priceForMargin(cost, marginPct);
  if (!result.ok) {
    return {
      state: result.reason === "margin_100" ? "margin_100" : "bad_input",
      reason: result.reason, marginPct, marginSource, category, band,
    };
  }

  const currency = slot?.currency || null;
  return {
    state: "ok",
    price: result.price,
    exact: result.exact,
    marginPct: String(marginPct),
    marginSource,
    currency,
    category,
    band,
    placement: placeInBand(result.price, band, currency),
    // Whether the row's own PVP already equals this. `null` = no price yet.
    matchesCurrent: slot?.retail_price === null || slot?.retail_price === undefined
      || String(slot.retail_price).trim() === ""
      ? null
      : (() => {
          const a = parseDecimal(slot.retail_price);
          const b = parseDecimal(result.price);
          return a && b ? compareDecimal(a, b) === 0 : false;
        })(),
  };
}

/** The approved brief's margin target, or null. Mirrors LinePlan: the fields
 *  sit DIRECTLY on the version, and only an APPROVED version governs — a draft
 *  someone is still typing into is not a commitment. */
export function approvedMarginTarget(brief) {
  const v = (brief?.versions || []).find((x) => x.status === "approved");
  const m = v?.margin_target;
  return m === null || m === undefined || String(m).trim() === "" ? null : String(m);
}

/** The direction's price bands, or []. `exists:false` and a direction with no
 *  working version both mean "no bands declared", which is a real answer. */
export function bandsOfDirection(direction) {
  const bands = direction?.items?.price_bands;
  return Array.isArray(bands) ? bands : [];
}
