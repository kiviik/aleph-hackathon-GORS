import test from "node:test";
import assert from "node:assert/strict";
import { LocalParkingDatabase } from "../src/dataStore.js";
import { ScenarioFrameSource } from "../src/frameSource.js";
import { MockInference } from "../src/mockInference.js";
import { runParkingAgent } from "../src/orchestrator.js";
import { createToolbox } from "../src/tools.js";

const sectors = [
  { sector_id: "S1", location_id: "regular", camera_ids: ["cam-1"], capacity: 2 },
  { sector_id: "S2", location_id: "restricted", camera_ids: ["cam-2"], capacity: 2 },
  { sector_id: "S3", location_id: "unknown", camera_ids: ["cam-3"], capacity: 2 },
];
const rules = [
  { sector_id: "S1", source: "TEST", restrictions: [] },
  {
    sector_id: "S2",
    source: "TEST",
    restrictions: [{ start_hour_utc: 0, end_hour_utc: 24, explanation: "Always restricted in test." }],
  },
];
const free = { state: "FREE", quality: "USABLE", confidence: 0.95, explanation: "Visible gap." };

test("runs the complete four-tool chain", async () => {
  const result = await run({ observation: free });
  assert.equal(result.decision, "PARK");
  assert.deepEqual(result.completedTools, ["read_frame", "lookup_sector", "lookup_rules", "decide"]);
});

test("rejects an out-of-order call and recovers", async () => {
  const result = await run({
    observation: free,
    injectedCalls: [{ name: "decide", arguments: {} }],
  });
  assert.equal(result.decision, "PARK");
  assert.equal(result.trace[0].type, "rejected_call");
  assert.match(result.trace[0].error, /Expected read_frame/);
});

test("refuses after retry exhaustion instead of inventing a result", async () => {
  const wrong = { name: "decide", arguments: {} };
  const result = await run({ observation: free, injectedCalls: [wrong, wrong, wrong] });
  assert.equal(result.decision, "REFUSE");
  assert.equal(result.code, "RETRY_EXHAUSTED");
  assert.deepEqual(result.completedTools, []);
});

test("free visual space does not override an active restriction", async () => {
  const result = await run({ observation: free, location: "restricted", camera_id: "cam-2" });
  assert.equal(result.decision, "DO_NOT_PARK");
  assert.equal(result.code, "RULE_PROHIBITS");
});

test("missing rule data causes refusal", async () => {
  const result = await run({ observation: free, location: "unknown", camera_id: "cam-3" });
  assert.equal(result.decision, "REFUSE");
  assert.equal(result.code, "RULES_UNAVAILABLE");
});

test("low vision confidence causes refusal", async () => {
  const result = await run({
    observation: { ...free, confidence: 0.77 },
  });
  assert.equal(result.decision, "REFUSE");
  assert.equal(result.code, "LOW_CONFIDENCE");
});

test("an unsafe QVAC PARK answer cannot override rules", async () => {
  const result = await run({
    observation: free,
    location: "restricted",
    camera_id: "cam-2",
    modelDecision: { decision: "PARK", reason: "Looks free.", confidence: 1 },
  });
  assert.equal(result.decision, "DO_NOT_PARK");
  assert.equal(result.code, "RULE_PROHIBITS");
  assert.equal(result.modelDecision.decision, "PARK");
});

test("rejects tool arguments that do not come from verified state", async () => {
  const result = await run({
    observation: free,
    injectedCalls: [
      { name: "read_frame", arguments: { camera_id: "attacker-camera" } },
    ],
  });
  assert.equal(result.decision, "PARK");
  assert.match(result.trace[0].error, /untrusted camera_id/);
});

async function run({
  observation,
  injectedCalls,
  modelDecision,
  location = "regular",
  camera_id = "cam-1",
}) {
  const database = new LocalParkingDatabase({ sectors, rules });
  const frameSource = new ScenarioFrameSource(observation);
  const inference = new MockInference({ observation, injectedCalls, modelDecision });
  const toolbox = createToolbox({ database, frameSource, inference });
  return runParkingAgent(
    { camera_id, location, datetime: "2026-08-22T15:00:00Z" },
    { inference, toolbox },
  );
}
