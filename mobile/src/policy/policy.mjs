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
    return refuse('DATA_MISSING', 'Missing evidence: there is not enough here to decide.')
  }
  if (observation.quality !== 'USABLE') {
    return refuse('FRAME_UNUSABLE', `The frame cannot be trusted: ${observation.quality.toLowerCase()}.`)
  }
  if (observation.state === 'UNCERTAIN' || observation.confidence < threshold) {
    return refuse('LOW_CONFIDENCE', 'The visual evidence is below the confidence threshold.')
  }
  if (observation.state === 'OCCUPIED') {
    return deny('NO_FREE_SPACE', 'The stretch of curb the camera can see is occupied.')
  }
  if (rules.sourceStatus !== 'AVAILABLE') {
    return refuse('RULES_UNAVAILABLE', 'No parking-rule source is available for this curb at this hour.')
  }
  if (!rules.parkingAllowed) {
    return deny('RULE_PROHIBITS', rules.explanation)
  }
  return {
    decision: 'PARK',
    code: 'FREE_AND_ALLOWED',
    reason: 'There is visible space, and the rules in force allow parking right now.',
    confidence: Math.min(observation.confidence, rules.confidence)
  }
}

function refuse (code, reason) { return { decision: 'REFUSE', code, reason, confidence: 0 } }
function deny (code, reason) { return { decision: 'DO_NOT_PARK', code, reason, confidence: 1 } }
