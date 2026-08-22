// The three approval lanes, read from the engine's own answer.
//
// `api/app/approvals.py` already models what the review reference draws: a
// concept version is signed by CREATIVE, COMMERCIAL and TECHNICAL, separately,
// by people who hold those lanes, and a rejection stays in the log forever. The
// engine returns the whole picture — required / satisfied / missing / rejected
// / history — precisely because the boolean is never the useful part: a
// merchandiser needs to know WHICH lane is missing to know who to ask.
//
// Everything here READS that answer. Nothing decides that a lane is signed,
// nothing decides readiness, and nothing invents a lane the brand did not
// require: `required` comes from the brand's policy, and a brand that requires
// two lanes must not be shown a third greyed out as if it were failing.
//
// Dependency-free so it is unit-testable — same rule as collectionBrief.mjs.

export const DISCIPLINES = ["creative", "commercial", "technical"];

export const LANE_LABEL = {
  creative: "Revisión creativa",
  commercial: "Revisión comercial",
  technical: "Revisión técnica",
};

// What each lane is actually answering. The reference labels the columns and
// leaves it there; three teams reading "revisión comercial" differently is how
// a sign-off means nothing.
export const LANE_QUESTION = {
  creative: "¿Es esta prenda, tal como se ve, parte de la colección?",
  commercial: "¿El precio, el margen y el rol comercial cierran?",
  technical: "¿Se puede fabricar así — material, construcción, entrega?",
};

export const LANE_WHO = {
  creative: "quien firma diseño",
  commercial: "quien firma comercial",
  technical: "quien firma producto/técnica",
};

// The lane as it reads inside a sentence — the engine's own `LABELS`
// (api/app/approvals.py), lowercase because that is where these end up.
export const LANE_SHORT = {
  creative: "creativa",
  commercial: "comercial",
  technical: "técnica",
};

/* -------------------------------------------------- the brand's own policy --
 * Four kinds of object can require sign-off, and WHICH lanes each one requires
 * is the brand's decision, not ours. `PUT /brands/{id}/approval-policy/{type}`
 * has accepted an empty list since the router was written — Atelier just never
 * asked. A one-person brand was being walked through three signatures it gave
 * itself, which proves nothing and is friction with a compliance costume on.
 */
// ⚠ THIS IS THE THIRD PLACE THIS VOCABULARY LIVES. The others are
// `routers/approvals.py::SUBJECTS` and the DB constraint `ck_policy_subject`
// (widened in migration 0070). Adding a subject type means all three, and
// only the constraint will tell you when you forget — the approvals table
// itself has no CHECK, so signing works while setting a policy does not.
export const POLICY_SUBJECTS = ["brief_version", "plan_version",
                                "concept_version", "launch", "tech_pack"];

export const SUBJECT_LABEL = {
  brief_version: "Brief de colección",
  plan_version: "Plan de rango",
  concept_version: "Versión de concepto",
  launch: "Lanzamiento",
  tech_pack: "Ficha técnica",
};

// The same list, as the grammatical subject of a sentence.
const SUBJECT_PHRASE = {
  brief_version: "Un brief de colección",
  plan_version: "Un plan de rango",
  concept_version: "Una versión de concepto",
  launch: "Un lanzamiento",
  tech_pack: "Una ficha técnica",
};

/** What this setting MEANS, said as a sentence, for one subject type.
 *
 *  ⚠ ZERO LANES IS A SETTING, NOT A HOLE. For a brand of one person it is the
 *  correct answer, so the sentence for it is written like every other one:
 *  no warning colour, no "todavía", nothing that reads as a step skipped. What
 *  it does carry is the part that would otherwise get blurred — the decision is
 *  still recorded, with a name and a time. Requiring nobody else's signature is
 *  not the same as nothing being written down.
 */
export function policySentence(subjectType, disciplines) {
  const subject = SUBJECT_PHRASE[subjectType] || "Este objeto";
  const lanes = DISCIPLINES.filter((d) => (disciplines || []).includes(d))
    .map((d) => LANE_SHORT[d]);

  if (!lanes.length) {
    return {
      none: true,
      text: `${subject} no necesita ninguna firma — lo aprobás vos, y la `
          + "aprobación queda registrada igual: con tu nombre y la fecha.",
    };
  }
  const list = lanes.length === 1
    ? lanes[0]
    : `${lanes.slice(0, -1).join(", ")} y ${lanes[lanes.length - 1]}`;
  return {
    none: false,
    text: lanes.length === 1
      ? `${subject} necesita la firma ${list}.`
      : `${subject} necesita las firmas ${list}.`,
  };
}

/** The state of ONE lane, from the engine's readiness payload.
 *
 *  `unset` and `missing` are different and stay different: a lane the brand
 *  does not require is not a hole in the approval, and colouring it like one
 *  would tell a two-lane brand it is permanently incomplete.
 */
export function laneState(readiness, discipline) {
  const required = readiness?.required || [];
  const rejected = (readiness?.rejected || []).find((r) => r.discipline === discipline);
  if (rejected) {
    return {
      status: "rejected", required: required.includes(discipline),
      by: rejected.by, at: rejected.at, verified: rejected.verified,
      reason: rejected.reason || null, authorised: true,
    };
  }
  const signed = (readiness?.satisfied || []).find((s) => s.discipline === discipline);
  if (signed) {
    return {
      status: "approved", required: required.includes(discipline),
      by: signed.by, at: signed.at, verified: signed.verified,
      authorised: signed.authorised, reason: null,
      // "Producción lo rechazó, y lo aprobó después de que el proveedor
      // cambiara" is a materially different history from "producción lo
      // aprobó". The engine keeps the rejection in the log for exactly that
      // reason; a card that shows only the current state throws away the part
      // the next person needs — so the earlier refusals travel with the lane.
      overturned: (readiness?.history || []).filter(
        (h) => h.discipline === discipline && h.decision === "reject"),
    };
  }
  // Signed in a lane nobody asked for. The engine keeps these on purpose — a
  // team that sought a sign-off it did not need did something worth seeing.
  const extra = (readiness?.extra_disciplines || []).includes(discipline);
  if (extra) {
    return { status: "approved", required: false, by: null, at: null,
             verified: null, authorised: null, reason: null, extra: true };
  }
  if (!required.includes(discipline)) {
    return { status: "unset", required: false, by: null, at: null, reason: null };
  }
  return { status: "missing", required: true, by: null, at: null, reason: null };
}

/** Every lane worth drawing: the required ones, plus any extra that was signed.
 *  Never all three by default — that would be the UI overriding the policy. */
export function lanesToShow(readiness) {
  const required = readiness?.required || [];
  const extra = readiness?.extra_disciplines || [];
  return DISCIPLINES.filter((d) => required.includes(d) || extra.includes(d));
}

/** One sentence for the decision bar: what stands between this version and
 *  approved. Derived from the engine's counts, never from a local tally. */
export function verdict(readiness) {
  if (!readiness) return null;
  const missing = readiness.missing || [];
  const rejected = readiness.rejected || [];
  const signed = readiness.satisfied || [];
  if (readiness.ready) {
    return {
      tone: "ready",
      text: `Las ${signed.length} firmas requeridas están. Esta versión queda aprobada para producción.`,
    };
  }
  if (rejected.length) {
    const names = rejected.map((r) => LANE_LABEL[r.discipline]?.toLowerCase() || r.discipline);
    return {
      tone: "blocked",
      text: signed.length
        ? `${signed.length} equipo(s) firmaron. Queda abierta la ${names.join(" y la ")}: hasta resolverla no se aprueba.`
        : `Rechazada en ${names.join(" y ")}. Hasta resolverla no se aprueba.`,
    };
  }
  const names = missing.map((d) => LANE_LABEL[d]?.toLowerCase() || d);
  return {
    tone: "waiting",
    text: `Falta la firma de ${names.join(" y de ")}. Nadie la rechazó — todavía no la miraron.`,
  };
}

/** Can this person sign this lane RIGHT NOW? The server decides for real; this
 *  only stops the UI offering a button whose 403 is already knowable. */
export function mayISign(me, discipline) {
  if (!me || !me.can_approve) return false;
  return (me.disciplines || []).includes(discipline);
}
