export const DEFAULT_CONFIDENCE_THRESHOLD = 0.78;

export function referenceDecision({ observation, sector, rules }, threshold = DEFAULT_CONFIDENCE_THRESHOLD) {
  if (!observation || !sector || !rules) {
    return refuse("DATA_MISSING", "Falta evidencia necesaria para decidir.");
  }
  if (observation.quality !== "USABLE") {
    return refuse("FRAME_UNUSABLE", `La imagen no es confiable: ${observation.quality.toLowerCase()}.`);
  }
  if (observation.state === "UNCERTAIN" || observation.confidence < threshold) {
    return refuse("LOW_CONFIDENCE", "La evidencia visual no alcanza el umbral de confianza.");
  }
  if (observation.state === "OCCUPIED") {
    return deny("NO_FREE_SPACE", "El sector observable está ocupado.");
  }
  if (rules.sourceStatus !== "AVAILABLE") {
    return refuse("RULES_UNAVAILABLE", "No hay una fuente de reglas disponible para este sector y horario.");
  }
  if (!rules.parkingAllowed) {
    return deny("RULE_PROHIBITS", rules.explanation);
  }
  return {
    decision: "PARK",
    code: "FREE_AND_ALLOWED",
    reason: "Hay espacio visible y las reglas de demostración permiten estacionar ahora.",
    confidence: Math.min(observation.confidence, rules.confidence),
  };
}

export function reconcileDecision(evidence, modelDecision, threshold = DEFAULT_CONFIDENCE_THRESHOLD) {
  const safe = referenceDecision(evidence, threshold);

  if (safe.decision !== "PARK") return { ...safe, modelDecision };
  if (!modelDecision || modelDecision.decision !== "PARK") {
    return refuse(
      "MODEL_DISAGREEMENT",
      "La evidencia determinística permite estacionar, pero el modelo local no lo confirmó.",
      modelDecision,
    );
  }

  return {
    ...safe,
    reason: modelDecision.reason,
    confidence: Math.min(safe.confidence, modelDecision.confidence),
    modelDecision,
  };
}

function refuse(code, reason, modelDecision) {
  return { decision: "REFUSE", code, reason, confidence: 0, ...(modelDecision ? { modelDecision } : {}) };
}

function deny(code, reason) {
  return { decision: "DO_NOT_PARK", code, reason, confidence: 1 };
}
