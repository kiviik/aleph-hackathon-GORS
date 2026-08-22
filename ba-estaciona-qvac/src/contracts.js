export const TOOL_ORDER = [
  "read_frame",
  "lookup_sector",
  "lookup_rules",
  "decide",
];

export const TOOL_DEFINITIONS = [
  {
    name: "read_frame",
    description:
      "Read the latest local camera frame and use on-device vision to determine whether a parking space is visible.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        camera_id: { type: "string", minLength: 1 },
      },
      required: ["camera_id"],
    },
  },
  {
    name: "lookup_sector",
    description:
      "Look up the parking sector and camera metadata in the local sector database.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        location: { type: "string", minLength: 1 },
      },
      required: ["location"],
    },
  },
  {
    name: "lookup_rules",
    description:
      "Look up the synthetic demo parking rules for a sector at an ISO-8601 date and time.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        sector_id: { type: "string", minLength: 1 },
        datetime: { type: "string", format: "date-time" },
      },
      required: ["sector_id", "datetime"],
    },
  },
  {
    name: "decide",
    description:
      "Use on-device QVAC inference to combine the verified frame observation, sector, and active rules. Call only after the other three tools succeeded.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
];

export const DECISIONS = ["PARK", "DO_NOT_PARK", "REFUSE"];
export const OBSERVATION_STATES = ["FREE", "OCCUPIED", "UNCERTAIN"];
export const FRAME_QUALITIES = ["USABLE", "DARK", "OCCLUDED", "BLURRY"];

export function expectedTool(completedTools) {
  return TOOL_ORDER[completedTools.length] ?? null;
}

export function validateObservation(value) {
  assertObject(value, "observation");
  assertEnum(value.state, OBSERVATION_STATES, "observation.state");
  assertEnum(value.quality, FRAME_QUALITIES, "observation.quality");
  assertNumberBetween(value.confidence, 0, 1, "observation.confidence");
  assertString(value.explanation, "observation.explanation");
  return value;
}

export function validateModelDecision(value) {
  assertObject(value, "decision");
  assertEnum(value.decision, DECISIONS, "decision.decision");
  assertString(value.reason, "decision.reason");
  assertNumberBetween(value.confidence, 0, 1, "decision.confidence");
  return value;
}

export function validateToolCall(call) {
  assertObject(call, "tool call");
  assertString(call.name, "tool call name");
  assertObject(call.arguments ?? {}, "tool call arguments");
  return { name: call.name, arguments: call.arguments ?? {} };
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}

function assertString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${label} must be a non-empty string`);
  }
}

function assertEnum(value, allowed, label) {
  if (!allowed.includes(value)) {
    throw new TypeError(`${label} must be one of ${allowed.join(", ")}`);
  }
}

function assertNumberBetween(value, minimum, maximum, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new TypeError(`${label} must be between ${minimum} and ${maximum}`);
  }
}
