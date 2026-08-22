// The send loop may never claim Atelier transmitted anything.
//
// The engine's own docstring (tech_pack_delivery.py, decision 0079): "THIS
// DOES NOT SEND ANYTHING. The engine has no mailer, and pretending otherwise
// would be worse than not having the feature." The endpoints RECORD what a
// person already sent by their own channel, and an acknowledgement is a
// RELAYED CLAIM — a brand user reporting "me confirmaron por WhatsApp" — not
// a read receipt this system observed.
//
// Every user-facing sentence of the loop lives in lib/techPackDelivery.mjs so
// this test can read all of them; the source check below keeps the components
// from growing copy of their own that breaks the promise.
import assert from "node:assert/strict";
import test from "node:test";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  ACK_ACTION, NOTICE_ACTION, PANEL_INTRO, SEND_ACTION, ackText, countsText,
  noticeText, sentText, staleText,
} from "@/lib/techPackDelivery.mjs";

const ROOT = new URL("..", import.meta.url).pathname;

// Representative recipient states — enough to exercise every branch of every
// sentence the module can produce.
const RECIPIENTS = [
  {},                                                        // nothing recorded
  { sent_at: "2026-08-17T10:00:00Z", channel: "mail" },      // sent, silence
  { sent_at: "2026-08-17T10:00:00Z",                         // relayed, unverified
    acknowledged_at: "2026-08-18T09:00:00Z", acknowledged_verified: false },
  { sent_at: "2026-08-17T10:00:00Z",                         // relayed, verified relayer
    acknowledged_at: "2026-08-18T09:00:00Z", acknowledged_verified: true },
  { sent_at: "2026-08-01T10:00:00Z", holds_stale: true,      // stale + told
    notice_sent_at: "2026-08-17T12:00:00Z" },
];

function everySentence() {
  const out = [SEND_ACTION, ACK_ACTION, NOTICE_ACTION, PANEL_INTRO];
  for (const r of RECIPIENTS) {
    out.push(sentText(r), ackText(r), noticeText(r), staleText(r));
  }
  out.push(countsText({ holding_stale: 2, unacknowledged: 3 }));
  return out.filter(Boolean);
}

// Phrases that would claim the system moved the document or witnessed its
// receipt. "Atelier no manda nada" is allowed — that is the disclaimer.
const TRANSMISSION_CLAIMS = [
  /atelier[^.]{0,24}\benvi/i,      // "Atelier envió/envía/enviará…"
  /\benviamos\b/i,                 // "we sent"
  /autom(á|a)tic/i,                // nothing here happens automatically
  /recibo de lectura/i,            // a read receipt is an observation we lack
  /\ble(í|i)do\b/i,                // "read" as a receipt state
  /acuse de recibo\b(?! que)/i,
];

test("no sentence in the loop claims transmission or a read receipt", () => {
  for (const s of everySentence()) {
    for (const claim of TRANSMISSION_CLAIMS) {
      assert.ok(!claim.test(s),
        `"${s}" matches ${claim} — the engine records, it does not send`);
    }
  }
});

test("the actions are registrations of what a person did", () => {
  for (const label of [SEND_ACTION, ACK_ACTION, NOTICE_ACTION]) {
    assert.match(label, /^Registrar /,
      "the verb is the semantics: the user did the thing, Atelier writes it down");
  }
  assert.equal(SEND_ACTION, "Registrar envío");
  assert.match(PANEL_INTRO, /no manda nada/i);
  assert.match(PANEL_INTRO, /no hay mailer/i);
});

test("a send is reported as registered, never as performed", () => {
  assert.equal(sentText({}), "sin envío registrado");
  const s = sentText({ sent_at: "2026-08-17T10:00:00Z", channel: "mail" });
  assert.match(s, /registrado/);
  assert.match(s, /2026-08-17/);
  assert.match(s, /por mail/);
});

test("an acknowledgement is labelled as a relayed claim, in both trust states", () => {
  const base = { sent_at: "2026-08-17T10:00:00Z",
                 acknowledged_at: "2026-08-18T09:00:00Z" };
  const unverified = ackText({ ...base, acknowledged_verified: false });
  const verified = ackText({ ...base, acknowledged_verified: true });

  for (const s of [unverified, verified]) {
    assert.match(s, /relatada/, "both are relays — neither is an observation");
  }
  // ⚠ The two must not render alike: `acknowledged_verified: false` means
  // nobody authenticated stands behind the relay, not "not acknowledged".
  assert.notEqual(unverified, verified);
  assert.match(unverified, /sin autenticar|nadie/i);
  assert.match(verified, /autenticado/);
  assert.match(verified, /no un acuse/i,
    "even the verified relay must deny being a receipt");
});

test("silence after a send is said plainly, and a notice is not a confirmation", () => {
  assert.match(ackText({ sent_at: "2026-08-17T10:00:00Z" }),
    /sin confirmación registrada/);
  assert.match(noticeText({ notice_sent_at: "2026-08-17T12:00:00Z" }),
    /avisada no es confirmada/);
  assert.equal(staleText({ holds_stale: true }),
    "tiene una versión que ya no es la vigente");
  assert.equal(staleText({ holds_stale: false }), null);
});

test("the counts line only exists when there is something to say", () => {
  assert.equal(countsText({ holding_stale: 0, unacknowledged: 0 }), null,
    "an empty warning line manufactures urgency");
  assert.equal(countsText({ holding_stale: 1, unacknowledged: 2 }),
    "1 con una versión vieja · 2 sin confirmación relatada");
});

test("the components speak through the tested module and add no claims", async () => {
  const files = ["components/views/TechPack.jsx", "components/views/Suppliers.jsx"];
  for (const rel of files) {
    const src = await readFile(join(ROOT, rel), "utf8");
    for (const claim of TRANSMISSION_CLAIMS) {
      const hit = src.split("\n").findIndex((l) =>
        !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l) && claim.test(l));
      assert.equal(hit, -1,
        `${rel}:${hit + 1} matches ${claim} — send-loop copy belongs in ` +
        "lib/techPackDelivery.mjs where this test can read it");
    }
  }
  const tp = await readFile(join(ROOT, "components/views/TechPack.jsx"), "utf8");
  assert.match(tp, /from "@\/lib\/techPackDelivery.mjs"/,
    "the desk must render the tested sentences, not retyped ones");
});
