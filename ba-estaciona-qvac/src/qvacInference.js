import {
  MMPROJ_SMOLVLM2_500M_MULTIMODAL_Q8_0,
  QWEN3_1_7B_INST_Q4,
  SMOLVLM2_500M_MULTIMODAL_Q8_0,
  completion,
  loadModel,
  unloadModel,
} from "@qvac/sdk";
import { z } from "zod";
import {
  TOOL_DEFINITIONS,
  validateModelDecision,
  validateObservation,
} from "./contracts.js";
import { parseJsonObject } from "./json.js";

const zodParameters = {
  read_frame: z.object({ camera_id: z.string().min(1) }).strict(),
  lookup_sector: z.object({ location: z.string().min(1) }).strict(),
  lookup_rules: z
    .object({
      sector_id: z.string().min(1),
      datetime: z.string().datetime(),
    })
    .strict(),
  decide: z.object({}).strict(),
};

export class QvacInference {
  constructor({ textModelId, visionModelId, seed = 42 }) {
    this.textModelId = textModelId;
    this.visionModelId = visionModelId;
    this.seed = seed;
  }

  static async create({ onProgress = defaultProgress, seed = 42 } = {}) {
    const [textModelId, visionModelId] = await Promise.all([
      loadModel({
        modelSrc: QWEN3_1_7B_INST_Q4,
        modelConfig: { ctx_size: 4096, tools: true, reasoning_budget: 0 },
        onProgress,
      }),
      loadModel({
        modelSrc: SMOLVLM2_500M_MULTIMODAL_Q8_0,
        modelConfig: {
          ctx_size: 2048,
          projectionModelSrc: MMPROJ_SMOLVLM2_500M_MULTIMODAL_Q8_0,
        },
        onProgress,
      }),
    ]);
    return new QvacInference({ textModelId, visionModelId, seed });
  }

  async close() {
    await Promise.all([
      unloadModel({ modelId: this.textModelId, clearStorage: false }),
      unloadModel({ modelId: this.visionModelId, clearStorage: false }),
    ]);
  }

  async planNextTool(state, feedback = []) {
    const history = [
      {
        role: "system",
        content: [
          "You are a small local parking agent.",
          "Call exactly one tool and never answer in prose.",
          "Use only values present in VERIFIED_STATE.",
          "The safe workflow is read_frame, lookup_sector, lookup_rules, decide.",
          "Never skip a missing step or repeat a completed step.",
        ].join(" "),
      },
      {
        role: "user",
        content: `VERIFIED_STATE\n${JSON.stringify(state)}\nVALIDATION_FEEDBACK\n${JSON.stringify(feedback)}`,
      },
    ];
    const tools = TOOL_DEFINITIONS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: zodParameters[tool.name],
    }));
    const final = await complete({
      modelId: this.textModelId,
      history,
      tools,
      stream: true,
      generationParams: {
        temp: 0,
        seed: this.seed,
        predict: 192,
        reasoning_budget: 0,
      },
    });
    if (final.toolCalls.length !== 1) {
      throw new Error(`Expected one tool call; received ${final.toolCalls.length}`);
    }
    const call = final.toolCalls[0];
    return { name: call.name, arguments: call.arguments ?? {} };
  }

  async observeFrame(frame) {
    if (!frame.path) throw new Error("QVAC vision requires a local frame path");
    return this.#validatedJson(
      {
        modelId: this.visionModelId,
        history: [
          {
            role: "system",
            content:
              "Inspect only the parking area visible in the image. Do not identify people or license plates. Return JSON only.",
          },
          {
            role: "user",
            content:
              'Return {"state":"FREE|OCCUPIED|UNCERTAIN","quality":"USABLE|DARK|OCCLUDED|BLURRY","confidence":0.0,"explanation":"short evidence"}. Use UNCERTAIN whenever the relevant curb is not clearly visible.',
            attachments: [{ path: frame.path }],
          },
        ],
        stream: true,
        generationParams: {
          temp: 0,
          seed: this.seed,
          predict: 256,
          reasoning_budget: 0,
        },
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "parking_observation",
            strict: true,
            schema: observationJsonSchema,
          },
        },
      },
      validateObservation,
      "Return one valid observation JSON object and no markdown.",
    );
  }

  async decide(evidence) {
    return this.#validatedJson(
      {
        modelId: this.textModelId,
        history: [
          {
            role: "system",
            content:
              "Decide from the supplied verified evidence only. A free visual space may still be legally unavailable. Missing, unusable, or low-confidence evidence requires REFUSE. Return JSON only.",
          },
          {
            role: "user",
            content: `EVIDENCE\n${JSON.stringify(evidence)}\nReturn {"decision":"PARK|DO_NOT_PARK|REFUSE","reason":"short auditable explanation","confidence":0.0}.`,
          },
        ],
        stream: true,
        generationParams: {
          temp: 0,
          seed: this.seed,
          predict: 256,
          reasoning_budget: 0,
        },
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "parking_decision",
            strict: true,
            schema: decisionJsonSchema,
          },
        },
      },
      validateModelDecision,
      "Return one valid decision JSON object and no markdown.",
    );
  }

  async #validatedJson(params, validate, correction) {
    let history = params.history;
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const final = await complete({ ...params, history });
      try {
        return validate(parseJsonObject(final.contentText));
      } catch (error) {
        lastError = error;
        history = [
          ...params.history,
          { role: "assistant", content: final.contentText || "(empty output)" },
          { role: "user", content: `${correction} Validation error: ${error.message}` },
        ];
      }
    }
    throw new Error(`Structured output validation failed: ${lastError?.message}`);
  }
}

async function complete(params) {
  const run = completion(params);
  for await (const _event of run.events) {
    // Consuming the canonical event stream guarantees final aggregation completes.
  }
  const final = await run.final;
  if (final.stopReason === "error") throw new Error("QVAC completion failed");
  return final;
}

function defaultProgress(progress) {
  if (progress.percentage === 100) {
    process.stderr.write(`QVAC model ready (${(progress.total / 1e6).toFixed(0)} MB)\n`);
  }
}

const observationJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    state: { type: "string", enum: ["FREE", "OCCUPIED", "UNCERTAIN"] },
    quality: { type: "string", enum: ["USABLE", "DARK", "OCCLUDED", "BLURRY"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    explanation: { type: "string", minLength: 1 },
  },
  required: ["state", "quality", "confidence", "explanation"],
};

const decisionJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    decision: { type: "string", enum: ["PARK", "DO_NOT_PARK", "REFUSE"] },
    reason: { type: "string", minLength: 1 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: ["decision", "reason", "confidence"],
};
