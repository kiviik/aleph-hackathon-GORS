// What the screen may say about a tech pack that left the building.
//
// ⚠ THE ENGINE SENDS NOTHING (engine `tech_pack_delivery.py`, decision 0079).
// There is no mailer. `POST …/send` RECORDS a delivery the user already made
// by mail or WhatsApp, so that `revise → release v2` can afterwards name who
// is still holding v1. Every sentence this module produces is therefore about
// what a PERSON did and reported — never about something Atelier transmitted.
// A screen that says "enviado" while nothing left the machine is exactly the
// false confidence the engine's own docstring exists to refuse.
//
// ⚠ AN ACKNOWLEDGEMENT IS A RELAYED CLAIM, NOT A READ RECEIPT. Suppliers have
// no login here; "acknowledged" is a brand user reporting "me confirmaron por
// WhatsApp". The engine marks `acknowledged_verified: false` when even the
// person RELAYING the claim was unauthenticated, and the two must not render
// alike — which is why the sentences live in one tested module instead of
// being retyped per component.
//
// Dependency-free (.mjs) so `tests/techPackSendLabel.test.mjs` can read every
// sentence the send loop is capable of showing and prove none claims
// transmission.

const day = (iso) => (iso ? String(iso).slice(0, 10) : null);

/** The action labels. "Registrar" is load-bearing: the user did the thing,
 *  Atelier writes it down. */
export const SEND_ACTION = "Registrar envío";
export const ACK_ACTION = "Registrar confirmación del proveedor";
export const NOTICE_ACTION = "Registrar aviso de versión nueva";

/** The panel's standing explanation of what this ledger is and is not. */
export const PANEL_INTRO =
  "Atelier no manda nada a la fábrica: no hay mailer. Acá se registra lo que "
  + "vos ya mandaste por tu canal — mail, WhatsApp, lo que uses — para que al "
  + "liberar la próxima versión el sistema pueda decir quién quedó con una "
  + "vieja.";

/** One recipient's send fact. Registered by a person, never performed here. */
export function sentText(r) {
  if (!r || !r.sent_at) return "sin envío registrado";
  const ch = r.channel ? ` por ${r.channel}` : "";
  return `envío registrado el ${day(r.sent_at)}${ch}`;
}

/**
 * One recipient's acknowledgement state — the claim/observation split, kept.
 *
 *   · nothing acknowledged: said plainly. Sent is not received.
 *   · acknowledged, relayer authenticated: still a relayed claim, and the
 *     sentence says whose word it rests on.
 *   · acknowledged, relayer NOT authenticated: recorded — losing it would be
 *     worse — but nobody named stands behind it, and the sentence says so.
 */
export function ackText(r) {
  if (!r || (!r.sent_at && !r.acknowledged_at)) return null;
  if (!r.acknowledged_at) {
    return "sin confirmación registrada — que salió no quiere decir que llegó";
  }
  const when = day(r.acknowledged_at);
  return r.acknowledged_verified
    ? `confirmación relatada el ${when} por alguien autenticado — es el dicho `
      + "del proveedor, no un acuse que este sistema haya observado"
    : `confirmación relatada el ${when} — la registró alguien sin autenticar, `
      + "así que nadie con nombre respalda el relato";
}

/** Told about a newer version — which is not the same as having confirmed it. */
export function noticeText(r) {
  if (!r || !r.notice_sent_at) return null;
  return `aviso de versión nueva registrado el ${day(r.notice_sent_at)} — `
    + "avisada no es confirmada";
}

/** Holding a file that is no longer the released one. */
export function staleText(r) {
  return r && r.holds_stale
    ? "tiene una versión que ya no es la vigente"
    : null;
}

/** The counts the engine derives, said as one line — or null when there is
 *  nothing to warn about, so the panel does not manufacture urgency. */
export function countsText(state) {
  if (!state) return null;
  const parts = [];
  if (state.holding_stale > 0) {
    parts.push(`${state.holding_stale} con una versión vieja`);
  }
  if (state.unacknowledged > 0) {
    parts.push(`${state.unacknowledged} sin confirmación relatada`);
  }
  return parts.length ? parts.join(" · ") : null;
}
