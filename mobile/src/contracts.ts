export type PipelineStage = "capture" | "detector" | "evidence" | "tools" | "policy";
export type PipelineStatus = "pending" | "blocked" | "ready";

export type TraceEvent = {
  stage: PipelineStage;
  status: PipelineStatus;
  detail: string;
};
