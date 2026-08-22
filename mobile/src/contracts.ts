export type PipelineStage = "capture" | "detector" | "evidence" | "tools" | "policy";
export type PipelineStatus = "pending" | "blocked" | "ready";
export type CameraPermission = "unknown" | "granted" | "denied" | "blocked";
export type FrameSource = "calgary-traffic-camera" | "local-fixture";
export type MobileDecision = "PARK" | "DO_NOT_PARK" | "REFUSE";

export type TraceEvent = {
  stage: PipelineStage;
  status: PipelineStatus;
  detail: string;
};

export type MobileTrace = {
  sessionId: string;
  startedAt: string;
  finishedAt: string;
  platform: "android" | "ios";
  osVersion: string;
  network: "not_used" | "calgary_open_data";
  decision: MobileDecision;
  reason: string;
  events: TraceEvent[];
  /** Which local engine actually produced the evidence, so a demo cannot overstate itself. */
  engine?: {
    detector: string;
    providers: string[];
    model: string | null;
    /** No local LLM in this slice: the deterministic policy decides alone. See src/policy/policy.mjs. */
    qvac_llm: "not_loaded" | string;
  };
};

const blockedDetail = "Se conserva REFUSE hasta validar el siguiente gate.";

export function createBlockedAnalysisTrace(platform: "android" | "ios", osVersion: string): MobileTrace {
  const now = new Date().toISOString();
  const sessionId = `${platform}-${Date.now().toString(36)}`;
  return {
    sessionId,
    startedAt: now,
    finishedAt: now,
    platform,
    osVersion,
    network: "not_used",
    decision: "REFUSE",
    reason: "La cámara está autorizada, pero la captura nativa y el modelo local todavía no están integrados en esta build.",
    events: [
      { stage: "capture", status: "blocked", detail: "Preview/captura nativa pendiente de integrar." },
      { stage: "detector", status: "blocked", detail: "ONNX, labels, input y NMS todavía no están fijados." },
      { stage: "evidence", status: "blocked", detail: blockedDetail },
      { stage: "tools", status: "pending", detail: "Se ejecutará sólo con evidencia estructurada local." },
      { stage: "policy", status: "ready", detail: "La policy fail-closed conserva REFUSE." },
    ],
  };
}

/** Trace for a completed analysis. Companion to createBlockedAnalysisTrace below. */
export function createAnalysisTrace(args: {
  osVersion: string;
  decision: MobileDecision;
  reason: string;
  events: TraceEvent[];
  engine?: MobileTrace["engine"];
  platform?: "android" | "ios";
}): MobileTrace {
  const now = new Date().toISOString();
  return {
    sessionId: `scan-${Date.now().toString(36)}`,
    startedAt: now,
    finishedAt: now,
    platform: args.platform ?? "android",
    osVersion: args.osVersion,
    network: "calgary_open_data",
    decision: args.decision,
    reason: args.reason,
    events: args.events,
    engine: args.engine,
  };
}
