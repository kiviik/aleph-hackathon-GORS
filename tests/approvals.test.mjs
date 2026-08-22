// The approval lanes, as the review room reads them. Every assertion here is
// that the SCREEN reads the engine's answer instead of forming its own — the
// same rule the brief's tests pin, for the same reason: readiness is what gates
// production, and a second opinion computed in a browser is not it.
import assert from "node:assert/strict";
import test from "node:test";

import {
  laneState, lanesToShow, mayISign, verdict,
} from "../lib/approvals.mjs";

const READY = {
  required: ["creative", "commercial", "technical"],
  satisfied: [
    { discipline: "creative", by: "Dirección creativa", verified: true, authorised: true, at: "2026-06-15T09:00:00-03:00" },
    { discipline: "commercial", by: "Compras", verified: true, authorised: true, at: "2026-06-15T09:00:00-03:00" },
    { discipline: "technical", by: "Producto técnico", verified: true, authorised: true, at: "2026-07-20T09:00:00-03:00" },
  ],
  missing: [], rejected: [], extra_disciplines: [], ready: true,
  single_actor_lanes: {}, unverified_disciplines: [], unauthorised_disciplines: [],
  history: [
    { discipline: "technical", decision: "reject", by: "Producto técnico", reason: "no se sostiene en este peso de tela", at: "2026-06-15T09:00:00-03:00" },
    { discipline: "technical", decision: "approve", by: "Producto técnico", at: "2026-07-20T09:00:00-03:00" },
  ],
};

test("a lane the brand does not require is UNSET, not missing", () => {
  // A two-lane brand shown a third lane as a hole is a brand told it is
  // permanently incomplete by a screen that overrode its own policy.
  const two = { required: ["creative", "commercial"], satisfied: [], missing: ["creative", "commercial"],
                rejected: [], extra_disciplines: [], history: [] };
  assert.equal(laneState(two, "technical").status, "unset");
  assert.equal(laneState(two, "technical").required, false);
  assert.equal(laneState(two, "creative").status, "missing");
  assert.deepEqual(lanesToShow(two), ["creative", "commercial"]);
});

test("a signed lane carries the rejection it overturned", () => {
  // "Producción lo rechazó y lo aprobó después de que el proveedor cambiara"
  // is a different history from "producción lo aprobó".
  const lane = laneState(READY, "technical");
  assert.equal(lane.status, "approved");
  assert.equal(lane.overturned.length, 1);
  assert.match(lane.overturned[0].reason, /peso de tela/);
  // And a lane that was never refused carries nothing.
  assert.deepEqual(laneState(READY, "creative").overturned, []);
});

test("a rejection standing now is the lane's state, with its reason", () => {
  const blocked = {
    required: ["creative", "technical"], satisfied: [], missing: [],
    rejected: [{ discipline: "technical", by: "Producto técnico", reason: "lead time", at: null, verified: true }],
    extra_disciplines: [], history: [],
  };
  const lane = laneState(blocked, "technical");
  assert.equal(lane.status, "rejected");
  assert.equal(lane.reason, "lead time");
});

test("an extra signature is shown, and is not counted as required", () => {
  // The engine keeps sign-offs in lanes nobody asked for on purpose: a team
  // that sought one did something worth seeing.
  const extra = { required: ["commercial"], satisfied: [], missing: ["commercial"],
                  rejected: [], extra_disciplines: ["technical"], history: [] };
  assert.deepEqual(lanesToShow(extra), ["commercial", "technical"]);
  const lane = laneState(extra, "technical");
  assert.equal(lane.status, "approved");
  assert.equal(lane.required, false);
});

test("the verdict names WHICH lane is missing, because that is who to go and ask", () => {
  const waiting = { required: ["creative", "technical"], satisfied: [], missing: ["technical"],
                    rejected: [], extra_disciplines: [], ready: false, history: [] };
  assert.match(verdict(waiting).text, /técnica/);
  assert.equal(verdict(waiting).tone, "waiting");
  assert.equal(verdict(READY).tone, "ready");
  assert.equal(verdict(null), null);
});

test("signing needs the lane, not merely permission to approve", () => {
  // `can_approve` alone answered "may they sign the technical review" with a
  // shrug; the engine has held lanes per user since 0039.
  assert.equal(mayISign({ can_approve: true, disciplines: ["creative"] }, "technical"), false);
  assert.equal(mayISign({ can_approve: true, disciplines: ["technical"] }, "technical"), true);
  // A user whose lanes were never set holds none — the nullable column is not
  // a wildcard, in the client either.
  assert.equal(mayISign({ can_approve: true }, "creative"), false);
  assert.equal(mayISign(null, "creative"), false);
});
