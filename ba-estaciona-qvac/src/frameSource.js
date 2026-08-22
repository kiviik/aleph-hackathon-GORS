import { access } from "node:fs/promises";
import path from "node:path";

export class LocalFrameSource {
  constructor({ cameraRegistry, framesDirectory }) {
    this.cameraRegistry = cameraRegistry;
    this.framesDirectory = framesDirectory;
  }

  async read(cameraId) {
    const entry = this.cameraRegistry[cameraId];
    if (!entry) throw new Error(`Unknown camera: ${cameraId}`);
    const framePath = path.resolve(this.framesDirectory, entry.file);
    await access(framePath);
    return { cameraId, path: framePath, capturedAt: entry.captured_at };
  }
}

export class ScenarioFrameSource {
  constructor(observation) {
    this.observation = observation;
  }

  async read(cameraId) {
    return { cameraId, fixtureObservation: structuredClone(this.observation) };
  }
}
