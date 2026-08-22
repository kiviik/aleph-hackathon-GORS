// The brief's client-side RULES, dependency-free so they are unit-testable.
// collectionBrief.js adds the network calls on top of these.
//
// Everything here derives from what the SERVER said. None of it decides that an
// approval happened, that a version is editable, or that a field is set — it
// only reads the server's own status and shapes it for the screen. That is the
// difference between this and the localStorage brief it replaces.

// The fields the form edits. In one place because a PATCH sends the whole
// content object: a key missing from this list would silently blank a field the
// server had stored.
export const CONTENT_FIELDS = [
  "season", "drop_name", "markets", "channels", "delivery_start", "delivery_end",
  "customer", "occasion", "commercial_objective", "creative_direction",
  "category_architecture", "price_architecture", "margin_target",
  "newness_target", "carryover_target", "constraints", "risks", "assumptions",
  "contradictory_evidence", "success_definition",
];

const EMPTY = {
  season: "", drop_name: "", markets: [], channels: [],
  delivery_start: null, delivery_end: null,
  customer: "", occasion: "", commercial_objective: "", creative_direction: "",
  category_architecture: {}, price_architecture: {},
  margin_target: null, newness_target: null, carryover_target: null,
  constraints: [], risks: [], assumptions: [], contradictory_evidence: [],
  success_definition: {},
};

/** A version's content as an editable form object. */
export function toForm(version) {
  if (!version) return { ...EMPTY };
  const out = { ...EMPTY };
  for (const f of CONTENT_FIELDS) {
    if (version[f] !== undefined && version[f] !== null) out[f] = version[f];
  }
  return out;
}

/** Form -> request body. An empty string becomes null so the server records
 *  absence rather than an empty string pretending to be an answer. */
export function toBody(form) {
  const out = {};
  for (const f of CONTENT_FIELDS) {
    const v = form[f];
    out[f] = typeof v === "string" && v.trim() === "" ? null : v;
  }
  return out;
}

/** What the team may do with this version RIGHT NOW, per the server's status. */
export function actions(version, { canApprove } = {}) {
  const status = version?.status;
  return {
    editable: status === "draft" || status === "in_review",
    submittable: status === "draft",
    approvable: status === "in_review" && !!canApprove,
    // In review, but this person cannot sign it. They can still edit.
    awaitingSomeoneElse: status === "in_review" && !canApprove,
    immutable: status === "approved" || status === "superseded",
  };
}

/* -------------------------------------------------------------------------
   How the screen READS and WRITES the free-form fields.

   `constraints`, `risks`, `assumptions` and `contradictory_evidence` are
   untyped JSON lists on the server: the UI writes strings, but an import or a
   future writer may put objects there. These live here, dependency-free, so
   the rules that decide what a stored value LOOKS LIKE on screen are testable
   without a DOM — same reason `actions()` is here.
   ------------------------------------------------------------------------- */

/** One stored entry as one readable line. An object is spelled out rather than
 *  rendered as "[object Object]" — or, worse, silently dropped. */
export function lineOf(entry) {
  if (entry == null) return "";
  if (typeof entry === "string") return entry;
  if (typeof entry === "number" || typeof entry === "boolean") return String(entry);
  if (Array.isArray(entry)) return entry.map(lineOf).filter(Boolean).join(" · ");
  return Object.entries(entry)
    .map(([k, v]) => `${k.replaceAll("_", " ")}: ${lineOf(v)}`)
    .join(" · ");
}

/** A stored list as display lines. A non-list is no lines, never a crash: the
 *  column is JSON and nothing at the database level makes it an array. */
export const asLines = (list) => (Array.isArray(list) ? list.map(lineOf).filter(Boolean) : []);

export const toLines = (list) => asLines(list).join("\n");
export const toCsv = (list) => asLines(list).join(", ");

/** Text back to a list. Blank lines vanish rather than becoming empty entries —
 *  an empty string in `risks` is a risk nobody wrote, and it would still count. */
export const fromLines = (value) =>
  String(value ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
export const fromCsv = (value) =>
  String(value ?? "").split(",").map((s) => s.trim()).filter(Boolean);

/** A target percentage as the server sent it. The trailing ".00" goes, the
 *  digits do NOT: these arrive as exact decimal strings, and parsing one to a
 *  float here would undo the reason the column is NUMERIC. */
export function pct(value) {
  const s = typeof value === "string" ? value.trim() : value == null ? "" : String(value);
  if (!s) return null;
  return `${s.replace(/\.00$/, "")}%`;
}
