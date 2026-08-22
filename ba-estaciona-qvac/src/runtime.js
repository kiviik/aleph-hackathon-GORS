import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { LocalParkingDatabase } from "./dataStore.js";
import { LocalFrameSource, ScenarioFrameSource } from "./frameSource.js";
import { MockInference } from "./mockInference.js";
import { createToolbox } from "./tools.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function createRuntime({ mode, scenario, seed = 42 }) {
  const database = await LocalParkingDatabase.fromFiles({
    sectorsPath: path.join(root, "data", "sectors.json"),
    rulesPath: path.join(root, "data", "rules.json"),
  });

  let inference;
  let frameSource;
  if (mode === "mock") {
    if (!scenario) throw new Error("Mock mode requires a scenario");
    inference = new MockInference({ observation: scenario.observation });
    frameSource = new ScenarioFrameSource(scenario.observation);
  } else if (mode === "qvac") {
    const { QvacInference } = await import("./qvacInference.js");
    const registry = JSON.parse(await readFile(path.join(root, "data", "cameras.json"), "utf8"));
    inference = await QvacInference.create({ seed });
    frameSource = new LocalFrameSource({
      cameraRegistry: registry,
      framesDirectory: path.join(root, "data", "frames"),
    });
  } else {
    throw new Error(`Unknown mode: ${mode}`);
  }

  return {
    inference,
    toolbox: createToolbox({ database, frameSource, inference }),
    close: () => inference.close(),
  };
}

export { root as projectRoot };
