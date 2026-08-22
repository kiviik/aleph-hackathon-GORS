#!/usr/bin/env node
import { runParkingAgent } from "./orchestrator.js";
import { createRuntime } from "./runtime.js";

const args = parseArgs(process.argv.slice(2));
if (!args.camera || !args.location) {
  console.error("Usage: npm run ask -- --camera cam-01 --location loc-carga --at 2026-08-22T15:00:00Z [--mode qvac|mock]");
  process.exit(2);
}

const mockScenario = {
  observation: { state: "FREE", quality: "USABLE", confidence: 0.93, explanation: "Mock fixture" },
};
const runtime = await createRuntime({ mode: args.mode, scenario: mockScenario });
try {
  const result = await runParkingAgent(
    { camera_id: args.camera, location: args.location, datetime: args.at },
    runtime,
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await runtime.close();
}

function parseArgs(argv) {
  const values = { mode: "qvac" };
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/, "");
    values[key] = argv[index + 1];
  }
  return values;
}
