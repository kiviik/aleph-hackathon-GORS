"use client";
// One status vocabulary, one rendering, every versioned object.
//
// WHY THIS EXISTS. Owner design audit, 2026-08-12, walking the product: the same
// state machine renders four different ways today — "En rango" as a yellow pill,
// "BORRADOR" as an outline pill, "sin versión aprobada" as a tab subtitle, and
// "Aprobado y congelado" as green prose. A reader cannot learn a vocabulary that
// changes shape per screen, and PLM users read status chips the way they read
// road signs: by silhouette, before the word.
//
// ⚠ THE VOCABULARY IS THE ENGINE'S, NOT A NEW ONE. These are the statuses the
// brief and plan version machines already use (`draft` / `in_review` /
// `approved` / `superseded`), plus the two derived states a screen genuinely
// needs to distinguish: `frozen` (approved AND immutable — what the engine
// means by an approved version nobody may edit) and `blocked` (readiness
// refuses). Inventing a fifth would be adding a second model of the same fact,
// which is the defect this whole audit thread keeps finding.
//
// ⚠ COLOUR IS NEVER THE ONLY SIGNAL. Every chip carries its word, and the two
// that mean "you cannot change this" carry a glyph. A merchandiser scanning a
// list of forty rows in a warehouse on a bad monitor is the user this is for.
import Icon from "@/components/ui/Icon";
import { statusOf, STATUS_LABELS } from "@/lib/statusVocabulary.mjs";

export { statusOf };

// `wash` backgrounds are deliberately pale: the chip is a label, not an alert.
// The ink values are the measured >=4.5:1 semantic roles from globals.css.
const STATES = {
  draft: {
    ink: "var(--ink-2)", bg: "transparent", border: "var(--hair-2)",
  },
  in_review: {
    ink: "var(--warning)", bg: "var(--ochre-wash)", border: "transparent",
  },
  approved: {
    ink: "var(--positive)", bg: "#E8F4EE", border: "transparent",
  },
  frozen: {
    glyph: "lock",
    ink: "#FFFFFF", bg: "var(--positive)", border: "transparent",
  },
  superseded: {
    ink: "var(--ink-3)", bg: "var(--paper-2)", border: "transparent",
  },
  blocked: {
    glyph: "close",
    ink: "var(--danger)", bg: "var(--clay-wash)", border: "transparent",
  },
};

export default function StatusChip({ status, frozen = false, blocked = false,
                                     compact = false, title }) {
  const key = statusOf(status, { frozen, blocked });
  const state = key ? STATES[key] : null;

  // ⚠ An unrecognised status is SHOWN, not swallowed. A chip that silently
  // renders nothing is how a screen ends up claiming a state it never checked.
  if (!state) {
    return status ? (
      <span className="ui-chip ui-chip-unknown" title={title || "estado no reconocido"}>
        {String(status)}
      </span>
    ) : null;
  }

  return (
    <span
      className={`ui-chip${compact ? " compact" : ""}`}
      title={title}
      style={{ color: state.ink, background: state.bg,
               boxShadow: state.border === "transparent"
                 ? "none" : `inset 0 0 0 1px ${state.border}` }}
    >
      {state.glyph && <Icon name={state.glyph} />}
      {STATUS_LABELS[key]}
    </span>
  );
}
