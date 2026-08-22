// Tech packs, grouped into the histories they already are.
//
// THE BUG THIS FIXES: `GET /tech-packs` returns EVERY version as its own row
// (ordered style_number, version DESC), and the desk rendered that list flat.
// So a style revised once appeared as two entries — "COM-PANT-01 v1" and
// "COM-PANT-01 v2" — with nothing saying they are the same garment. A list of
// fichas that shows the same ficha twice reads as duplicated data, not as
// history, and the version the factory actually quotes against was not
// distinguishable from the draft superseding it.
//
// The engine has stored all of this since 0058. Nothing here computes a new
// fact: every field is read off rows the API already sends.
//
// ⚠ HONESTY RULES:
//   · `released` is the version a factory may quote. The engine enforces ONE
//     released version per style with a partial unique index, so this reads
//     the flag rather than guessing "the highest number is the real one".
//   · A style with NO released version says so. "Not released yet" is the
//     answer, never the newest draft standing in for one.
//   · `latest` and `released` are SEPARATE. Collapsing them is how a screen
//     shows a draft where a signed-off document belongs.

const RELEASED = "released";

// Highest version first — the order a person reads a history in.
function byVersionDesc(a, b) {
  return (Number(b.version) || 0) - (Number(a.version) || 0);
}

/**
 * Group a flat list of tech-pack records into one entry per style.
 *
 * @param {Array} packs records from `GET /tech-packs`
 * @returns {Array} one entry per style_number, each with its full version list
 */
export function groupByStyle(packs = []) {
  const byStyle = new Map();

  for (const p of packs) {
    if (!p || !p.style_number) continue;
    if (!byStyle.has(p.style_number)) byStyle.set(p.style_number, []);
    byStyle.get(p.style_number).push(p);
  }

  const groups = [...byStyle.entries()].map(([style_number, rows]) => {
    const versions = [...rows].sort(byVersionDesc);
    const latest = versions[0] || null;
    // Read the flag. The newest row is NOT evidence of what was released.
    const released = versions.find((v) => v.status === RELEASED) || null;

    return {
      style_number,
      // The newest row that actually carries a name; a later revision created
      // without one must not blank a name an earlier version had.
      name: versions.find((v) => v.name)?.name || null,
      versions,
      count: versions.length,
      latest,
      released,
      // Stated as a fact, so the screen never has to infer it from `released`
      // being null — an absent release is a real state, not missing data.
      hasRelease: released !== null,
      // A draft sitting ABOVE the released version: work in progress on a
      // document a factory may already be holding. That is the state worth
      // showing, and it is exactly what "Liberada v1 · Revisión v2" means.
      revisionInFlight: Boolean(
        released && latest && Number(latest.version) > Number(released.version)),
    };
  });

  // Styles needing attention first: a revision in flight, then never-released,
  // then settled. Within each, the most recently touched style leads.
  return groups.sort((a, b) => {
    const rank = (g) => (g.revisionInFlight ? 0 : g.hasRelease ? 2 : 1);
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    return String(b.latest?.created_at || "").localeCompare(
      String(a.latest?.created_at || ""));
  });
}

/**
 * The version history for ONE style, newest first — for the detail screen,
 * which today shows only the version it opened and no way to see the rest.
 */
export function historyFor(packs = [], styleNumber) {
  if (!styleNumber) return [];
  return packs
    .filter((p) => p && p.style_number === styleNumber)
    .sort(byVersionDesc);
}

/**
 * How many fields a human or the supplier actually stood behind.
 *
 * `ai_proposed` and `imported` are NOT verification — that distinction is the
 * product's spine, and the count is what the desk shows beside a pack. Kept
 * here so the list and the detail cannot drift into two different answers.
 */
export function verifiedCount(pack) {
  const fields = pack?.fields || {};
  return Object.values(fields).filter(
    (f) => f?.provenance === "human_verified"
        || f?.provenance === "supplier_confirmed").length;
}
