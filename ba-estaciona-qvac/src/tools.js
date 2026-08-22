import { reconcileDecision } from "./policy.js";
import { validateModelDecision, validateObservation } from "./contracts.js";

export function createToolbox({ database, frameSource, inference, confidenceThreshold }) {
  return {
    async read_frame({ camera_id }) {
      const frame = await frameSource.read(camera_id);
      const observation = await inference.observeFrame(frame);
      return validateObservation(observation);
    },

    async lookup_sector({ location }) {
      return database.lookupSector(location);
    },

    async lookup_rules({ sector_id, datetime }) {
      return database.lookupRules(sector_id, datetime);
    },

    async decide(_arguments, state) {
      const evidence = {
        observation: state.results.read_frame,
        sector: state.results.lookup_sector,
        rules: state.results.lookup_rules,
      };
      const modelDecision = validateModelDecision(await inference.decide(evidence));
      return reconcileDecision(evidence, modelDecision, confidenceThreshold);
    },
  };
}
