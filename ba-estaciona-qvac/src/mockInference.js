import { referenceDecision } from "./policy.js";

export class MockInference {
  constructor({ observation, injectedCalls = [], modelDecision } = {}) {
    this.observation = observation;
    this.injectedCalls = [...injectedCalls];
    this.modelDecision = modelDecision;
  }

  async planNextTool(state) {
    if (this.injectedCalls.length > 0) return this.injectedCalls.shift();
    const next = ["read_frame", "lookup_sector", "lookup_rules", "decide"].find(
      (name) => !state.completedTools.includes(name),
    );
    if (next === "read_frame") {
      return { name: next, arguments: { camera_id: state.request.camera_id } };
    }
    if (next === "lookup_sector") {
      return { name: next, arguments: { location: state.request.location } };
    }
    if (next === "lookup_rules") {
      return {
        name: next,
        arguments: {
          sector_id: state.results.lookup_sector.sector_id,
          datetime: state.request.datetime,
        },
      };
    }
    return { name: "decide", arguments: {} };
  }

  async observeFrame(frame) {
    return frame.fixtureObservation ?? this.observation;
  }

  async decide(evidence) {
    if (this.modelDecision) return this.modelDecision;
    const safe = referenceDecision(evidence);
    return {
      decision: safe.decision,
      reason: safe.reason,
      confidence: safe.decision === "REFUSE" ? 0.5 : safe.confidence,
    };
  }

  async close() {}
}
