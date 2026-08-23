import { memo } from "react";

import { DetailRow, type Tone } from "./DetailRow";
import type { ScanProgress } from "../state/spots";

function toneFor(status: ScanProgress["status"]): Tone {
  if (status === "ready") return "ok";
  if (status === "blocked") return "bad";
  return "warn";
}

export const PipelineRow = memo(function PipelineRow({
  cameraId,
  stage,
  status,
  detail,
}: {
  cameraId: string;
  stage: string;
  status: ScanProgress["status"];
  detail: string;
}) {
  return <DetailRow label={`${cameraId} · ${stage}`} value={detail} tone={toneFor(status)} />;
});
