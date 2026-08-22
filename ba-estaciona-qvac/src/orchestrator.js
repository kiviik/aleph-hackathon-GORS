import { expectedTool, validateToolCall } from "./contracts.js";

export async function runParkingAgent(
  request,
  { inference, toolbox, maxAttemptsPerStep = 3, now = () => new Date() },
) {
  const state = {
    request: normalizeRequest(request, now),
    completedTools: [],
    results: {},
    trace: [],
  };

  while (expectedTool(state.completedTools)) {
    const expected = expectedTool(state.completedTools);
    let executed = false;
    const feedback = [];

    for (let attempt = 1; attempt <= maxAttemptsPerStep; attempt += 1) {
      let call;
      try {
        call = validateToolCall(await inference.planNextTool(publicState(state), feedback));
        validateExpectedCall(call, expected, state);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        feedback.push(message);
        state.trace.push({ type: "rejected_call", expected, attempt, error: message });
        continue;
      }

      try {
        const result = await toolbox[call.name](call.arguments, state);
        state.results[call.name] = result;
        state.completedTools.push(call.name);
        state.trace.push({ type: "tool_result", tool: call.name, attempt, result });
        executed = true;
        break;
      } catch (error) {
        return refusal(state, "TOOL_FAILED", `${call.name} falló: ${error.message}`);
      }
    }

    if (!executed) {
      return refusal(
        state,
        "RETRY_EXHAUSTED",
        `El modelo local no pudo encadenar ${expected} correctamente después de ${maxAttemptsPerStep} intentos.`,
      );
    }
  }

  return {
    ...state.results.decide,
    request: state.request,
    completedTools: state.completedTools,
    trace: state.trace,
  };
}

function normalizeRequest(request, now) {
  if (!request || typeof request !== "object") throw new TypeError("request is required");
  if (!request.camera_id || !request.location) {
    throw new TypeError("camera_id and location are required");
  }
  const datetime = new Date(request.datetime ?? now());
  if (Number.isNaN(datetime.valueOf())) throw new TypeError("datetime must be valid");
  return { camera_id: request.camera_id, location: request.location, datetime: datetime.toISOString() };
}

function validateExpectedCall(call, expected, state) {
  if (call.name !== expected) {
    throw new Error(`Expected ${expected}; model requested ${call.name}`);
  }
  const args = call.arguments;
  if (expected === "read_frame" && args.camera_id !== state.request.camera_id) {
    throw new Error("read_frame used an untrusted camera_id");
  }
  if (expected === "lookup_sector" && args.location !== state.request.location) {
    throw new Error("lookup_sector used a location different from the request");
  }
  if (expected === "lookup_rules") {
    if (args.sector_id !== state.results.lookup_sector?.sector_id) {
      throw new Error("lookup_rules did not use the sector returned by lookup_sector");
    }
    if (args.datetime !== state.request.datetime) {
      throw new Error("lookup_rules did not use the requested datetime");
    }
  }
  if (expected === "decide" && Object.keys(args).length > 0) {
    throw new Error("decide does not accept model-supplied evidence");
  }
}

function publicState(state) {
  return structuredClone({
    request: state.request,
    completedTools: state.completedTools,
    results: state.results,
  });
}

function refusal(state, code, reason) {
  return {
    decision: "REFUSE",
    code,
    reason,
    confidence: 0,
    request: state.request,
    completedTools: state.completedTools,
    trace: state.trace,
  };
}
