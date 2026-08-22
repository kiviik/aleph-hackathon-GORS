/**
 * Pre-flight brief check — the rendering logic, extracted so it can be tested.
 *
 * The engine decides everything that matters (which fields are open, which tier
 * they belong to, what to say about them). Nothing here re-judges any of it:
 * this module groups, counts and formats, and if it ever starts deciding
 * whether a field is really missing there will be two answers to that question
 * and the screen will be able to disagree with the API.
 *
 * `asPlainText` is not a nicety. The build handoff's distribution mechanism for
 * this tool is a designer sending the output to another designer, and what gets
 * sent is text pasted into WeChat or WhatsApp — not a screenshot of a web app.
 */

export const TIERS = ["blocking", "sample_round", "cost_variance"];

export const TIER_META = {
  blocking: {
    label: "Blocking",
    meaning: "The factory cannot quote at all until this is answered.",
  },
  sample_round: {
    label: "Sample-round risk",
    meaning: "They will quote, and the sample will come back wrong.",
  },
  cost_variance: {
    label: "Cost-variance risk",
    meaning: "They will quote, and the price will move later.",
  },
};

export const STATUS_LABEL = {
  missing: "Missing",
  ambiguous: "Ambiguous",
  present: "Present",
};

/** Flags grouped into the three tiers, empty tiers dropped. */
export function groupByTier(result) {
  const flags = (result && result.flags) || [];
  return TIERS.map((tier) => ({
    tier,
    ...TIER_META[tier],
    flags: flags.filter((f) => f.tier === tier),
  })).filter((group) => group.flags.length > 0);
}

/** "4 blocking · 7 sample-round · 3 cost-variance", or the all-clear. */
export function headline(result) {
  if (!result) return "";
  if (result.unreadable) return "This document could not be read.";
  const open = (result.summary && result.summary.open) || 0;
  if (open === 0) {
    return `Nothing open across ${result.summary.checks_run} checks.`;
  }
  const by = (result.summary && result.summary.by_tier) || {};
  return TIERS.filter((t) => by[t] > 0)
    .map((t) => `${by[t]} ${TIER_META[t].label.toLowerCase()}`)
    .join(" · ");
}

/**
 * How much of the answer we can stand behind, said plainly.
 *
 * Three states, never collapsed into two: the quotes were checked and hold, the
 * quotes were checked and some did not, or there was no text to check against.
 * A photo of a spec sheet must not render with the confidence of a paste.
 */
export function readingCaveat(result) {
  const reading = (result && result.reading) || {};
  if (reading.unverified_fields && reading.unverified_fields.length > 0) {
    return {
      tone: "warn",
      text: `${reading.unverified_fields.length} reading(s) could not be traced back to the document: ${reading.unverified_fields.join(", ")}. Treat those flags as the reader's word, not the document's.`,
    };
  }
  if (reading.evidence_verifiable === false) {
    return {
      tone: "warn",
      text: "This was read from an image, so the quotes below could not be checked against a source. Paste the text if you want them verified.",
    };
  }
  return {
    tone: "ok",
    text: "Every quote below was found in the document you gave it.",
  };
}

/** The whole answer as text, for pasting into the chat where the work happens. */
export function asPlainText(result) {
  if (!result) return "";
  if (result.unreadable) {
    return `PRE-FLIGHT BRIEF CHECK\n\n${(result.reading && result.reading.note) || "This document could not be read."}`;
  }
  const lines = ["PRE-FLIGHT BRIEF CHECK", headline(result), ""];
  for (const group of groupByTier(result)) {
    lines.push(`--- ${group.label.toUpperCase()} — ${group.meaning}`, "");
    for (const flag of group.flags) {
      lines.push(`${STATUS_LABEL[flag.status].toUpperCase()}: ${flag.field}`);
      lines.push(`  Why: ${flag.why}`);
      if (flag.note) lines.push(`  What's unclear: ${flag.note}`);
      lines.push(`  They'll ask: ${flag.they_will_ask.zh}  /  ${flag.they_will_ask.en}`);
      lines.push(`  Suggest: ${flag.suggest}`);
      lines.push("");
    }
  }
  const passed = (result.passed || []).length;
  if (passed > 0) {
    lines.push(`${passed} of ${result.summary.checks_run} checks passed: ` +
      result.passed.map((f) => f.field).join(", "));
  }
  return lines.join("\n").trimEnd();
}

/**
 * Read a File into the base64 the engine wants.
 *
 * `readAsDataURL` rather than `readAsArrayBuffer` because the data-URI prefix
 * is exactly what has to be stripped, and doing it this way keeps the browser's
 * own base64 encoder rather than hand-rolling one over a byte array.
 */
export function base64FromDataUrl(dataUrl) {
  const comma = String(dataUrl || "").indexOf(",");
  return comma === -1 ? "" : dataUrl.slice(comma + 1);
}
