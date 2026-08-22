// The WORLD layer's client — the one part of this app that is not about a brand.
//
// WHY IT IS A SEPARATE MODULE FROM lib/api.js. Every other call in this app
// resolves a brand first (`getBrandId`, `readBrandPref`, the `TARGET_BRAND`
// env) because every other answer is that brand's. The world layer is the
// opposite shape by construction: `world_observations` has no brand column and
// a test in the engine asserts its absence on both ledger tables. If a world
// request ever carried a brand id, two brands asking the same question could
// get two different answers — and the whole argument for a shared evidence
// network is that they cannot.
//
// So the rule is enforced here rather than remembered: `worldGet` REFUSES a
// path containing a brand parameter. It is one line and it makes the invariant
// checkable instead of conventional — the same reasoning the engine uses when
// it puts an invariant in a CHECK constraint rather than in a docstring.
//
// NO DEMO FALLBACK, DELIBERATELY. `lib/api.js` degrades to bundled demo data so
// a disconnected laptop still renders a brand. This module returns an ERROR
// instead, because the failure modes are not comparable: a demo brand is
// obviously synthetic, whereas plausible-looking market evidence with no source
// is exactly the "false intelligence" the 08-07 purge removed. A world screen
// with no engine says so.

import { engineFetch } from "./auth";
// The rules live in the `.mjs` twin so they can be tested without a browser.
export {
  MEASUREMENT_LABEL, STATUS_LABEL, TRAJECTORY_LABEL, WorldRequestRefused,
  assertBrandFree, byTrajectory, cycleVerdict, forecastValue, freshness,
  isCitable, latestPerScope, sharePct,
} from "./world.mjs";
import { assertBrandFree } from "./world.mjs";

const API_BASE = process.env.NEXT_PUBLIC_ATELIER_API || "http://127.0.0.1:8000";

async function worldGet(path) {
  assertBrandFree(path);
  const res = await engineFetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

/** The declared markets and how many of them have any evidence at all.
 *  The gap between those two numbers IS the coverage story. */
export async function getMarkets() {
  return worldGet("/world/markets");
}

/** Stored forecasts, filterable by state. `indicative` is a real state and has
 *  to be visible, or the word only exists in a docstring. */
export async function getForecasts({ status, limit = 100 } = {}) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (limit) params.set("limit", String(limit));
  return worldGet(`/world/forecasts?${params.toString()}`);
}

/** One forecast, whatever its state, with the calibration it was judged under. */
export async function getForecast(id) {
  return worldGet(`/world/forecasts/${encodeURIComponent(id)}`);
}

/** The scheduled passes: when the layer last advanced, and what failed.
 *  A feed with no freshness is a feed nobody can trust. */
export async function getCycles(limit = 5) {
  return worldGet(`/world/cycles?limit=${limit}`);
}

/** The observations behind one series — both halves of every share. */
export async function getObservations({ trendId, channel, geography, limit }) {
  const params = new URLSearchParams({ trend_id: trendId, channel, geography });
  if (limit) params.set("limit", String(limit));
  return worldGet(`/world/observations?${params.toString()}`);
}

