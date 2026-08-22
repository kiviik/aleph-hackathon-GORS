export type PipelineStage = "capture" | "detector" | "evidence" | "tools" | "policy";
export type PipelineStatus = "pending" | "blocked" | "ready";
export type CameraPermission = "unknown" | "granted" | "denied" | "blocked";
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
  platform: "android";
  osVersion: string;
  network: "not_used";
  decision: MobileDecision;
  reason: string;
  events: TraceEvent[];
};

const blockedDetail = "Se conserva REFUSE hasta validar el siguiente gate.";

export function createBlockedAnalysisTrace(osVersion: string): MobileTrace {
  const now = new Date().toISOString();
  const sessionId = `android-${Date.now().toString(36)}`;
  return {
    sessionId,
    startedAt: now,
    finishedAt: now,
    platform: "android",
    osVersion,
    network: "not_used",
    decision: "REFUSE",
    reason: "La cámara está autorizada, pero la captura nativa y el modelo local todavía no están integrados en este APK.",
    events: [
      { stage: "capture", status: "blocked", detail: "Preview/captura nativa pendiente de integrar." },
      { stage: "detector", status: "blocked", detail: "ONNX, labels, input y NMS todavía no están fijados." },
      { stage: "evidence", status: "blocked", detail: blockedDetail },
      { stage: "tools", status: "pending", detail: "Se ejecutará sólo con evidencia estructurada local." },
      { stage: "policy", status: "ready", detail: "La policy fail-closed conserva REFUSE." },
    ],
  };
}
