// Deterministic decision gate. Ported from ba-estaciona-qvac/src/policy.js with the SAME
// thresholds and the SAME branch order, so the mobile verdict matches the prototype's contract.
//
// IMPORTANT: mobile calls referenceDecision(), NOT reconcileDecision(). reconcileDecision requires
// a local LLM opinion and returns REFUSE / MODEL_DISAGREEMENT when given none -- with no LLM in
// this slice that would make PARK permanently unreachable, which looks like a working fail-closed
// system while actually being broken. The trace records qvac_llm: 'not_loaded' instead.
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.78

export function referenceDecision ({ observation, sector, rules }, threshold = DEFAULT_CONFIDENCE_THRESHOLD) {
  if (!observation || !sector || !rules) {
    return refuse('DATA_MISSING', 'Falta evidencia necesaria para decidir.')
  }
  if (observation.quality !== 'USABLE') {
    return refuse('FRAME_UNUSABLE', `La imagen no es confiable: ${observation.quality.toLowerCase()}.`)
  }
  if (observation.state === 'UNCERTAIN' || observation.confidence < threshold) {
    return refuse('LOW_CONFIDENCE', 'La evidencia visual no alcanza el umbral de confianza.')
  }
  if (observation.state === 'OCCUPIED') {
    return deny('NO_FREE_SPACE', 'El sector observable está ocupado.')
  }
  if (rules.sourceStatus !== 'AVAILABLE') {
    return refuse('RULES_UNAVAILABLE', 'No hay una fuente de reglas disponible para este sector y horario.')
  }
  if (!rules.parkingAllowed) {
    return deny('RULE_PROHIBITS', rules.explanation)
  }
  return {
    decision: 'PARK',
    code: 'FREE_AND_ALLOWED',
    reason: 'Hay espacio visible y las reglas vigentes permiten estacionar ahora.',
    confidence: Math.min(observation.confidence, rules.confidence)
  }
}

function refuse (code, reason) { return { decision: 'REFUSE', code, reason, confidence: 0 } }
function deny (code, reason) { return { decision: 'DO_NOT_PARK', code, reason, confidence: 1 } }
