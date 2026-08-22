# BA Estaciona · QVAC Track 2

**Question:** “¿Puedo estacionar acá, ahora?”

BA Estaciona is a local-first parking decision agent built for QVAC Track 2: tool use and small-model reliability. It does not merely detect an empty curb. It must collect visual evidence, resolve the sector, check the rules for the requested time, and only then decide. If any evidence is missing or unreliable, it refuses.

> Safety boundary: this repository contains **synthetic demonstration rules**, not authoritative GCBA regulation. It must not be used as legal parking advice or enforcement software.

## Why Track 2

The hard problem is reliable tool chaining with a small local model:

```text
read_frame(camera_id)
        ↓
lookup_sector(location)
        ↓
lookup_rules(sector_id, datetime)
        ↓
decide()
```

A visually free space can still produce `DO_NOT_PARK` when a restriction is active. A dark, occluded, blurry, low-confidence, or rule-less case produces `REFUSE`. This exposes exactly the failures the track asks teams to measure: skipped calls, wrong arguments, ignored tool results, malformed output, and unsupported answers.

## QVAC integration

All inference runs locally through [`@qvac/sdk`](https://docs.qvac.tether.io/js-ts-sdk/). There is no cloud provider, API key, remote inference fallback, or video upload path.

- [`src/qvacInference.js`](src/qvacInference.js) loads `QWEN3_1_7B_INST_Q4` for tool selection and the final evidence judgment.
- The same file loads `SMOLVLM2_500M_MULTIMODAL_Q8_0` with its matching projection model for local frame understanding, using the SDK's documented local [`attachments`](https://docs.qvac.tether.io/ai-capabilities/multimodal/) input.
- [`src/contracts.js`](src/contracts.js) contains the four tool schemas.
- [`src/orchestrator.js`](src/orchestrator.js) validates order, arguments, retries, and trace evidence.
- [`src/policy.js`](src/policy.js) applies the conservative safety invariant: a model-generated `PARK` can never override missing evidence, a rule restriction, poor image quality, or confidence below `0.78`.

The implementation consumes QVAC's canonical `completion().events` stream and `completion().final` result, following the current [text-generation API](https://docs.qvac.tether.io/ai-capabilities/text-generation/).

## Reliability design

1. The local text model chooses one tool at a time from typed schemas.
2. A state machine checks the call against the required workflow.
3. Arguments must be copied from verified state; invented camera, location, sector, or time values are rejected.
4. A rejected call receives validation feedback and up to three attempts.
5. Tool errors, missing data, and exhausted retries return `REFUSE`, never a guessed answer.
6. Vision and decision JSON are parsed, validated, and retried up to three times.
7. The final QVAC judgment is reconciled with deterministic safety constraints.
8. Every accepted and rejected step is retained in the result trace for audit.

## Requirements

- A platform supported by QVAC's [system requirements](https://docs.qvac.tether.io/system-requirements/)
- Node.js 22.17 or newer
- npm 10.9 or newer
- Enough storage for the one-time model downloads
- Five locally recorded and privacy-cropped evaluation frames (see [`data/frames/README.md`](data/frames/README.md))

## Clean-clone setup

```bash
cd ba-estaciona-qvac
npm install
npx --package "@qvac/cli" qvac doctor
npm test
```

The first real run downloads the configured model files once. Keep QVAC logging enabled with:

```bash
export QVAC_CONFIG_PATH="$PWD/qvac.config.json"
```

## Run one local query

After adding the frame files listed in `data/cameras.json`:

```bash
npm run ask -- \
  --mode qvac \
  --camera cam-carga \
  --location loc-carga \
  --at 2026-08-22T15:00:00Z
```

The expected demo behavior is `DO_NOT_PARK`: the frame can be visually free while the synthetic loading restriction is active.

## Reliability evaluation

The checked-in matrix has 30 scenarios. Each is run five times by default.

```bash
# Fast controller/policy check with fixture observations
npm run evaluate:mock -- --output reports/mock-baseline

# Real local QVAC inference over the supplied frames
npm run evaluate:qvac -- --output reports/qvac-local
```

Both commands produce JSON (raw runs) and Markdown (judge-friendly table). The report records decision accuracy, complete-chain rate, rejected calls, median latency, p95 latency, and every failure.

The mock result is intentionally labeled `MOCK_ORCHESTRATION_ONLY_NOT_MODEL_EVIDENCE`. It proves the harness and invariants work, but it is not a model-accuracy claim. Only the QVAC report can support submission metrics.

## Tests

```bash
npm test
```

The adversarial tests cover:

- correct four-tool chaining;
- recovery from an out-of-order `decide` call;
- refusal after retries are exhausted;
- a visually free but restricted space;
- missing rules;
- low-confidence vision;
- an unsafe model answer blocked by policy; and
- an invented camera ID rejected before execution.

## Real-input recording plan

Use [`RECORDING_PLAN.md`](RECORDING_PLAN.md). Record the same curb in five conditions: free by day, occupied by day, dark, occluded by a truck or other large object, and rain/blur. Extract one representative frame for each condition, crop to the parking area, and remove or obscure faces and readable plates before committing anything.

## Submission evidence still required

- Run `npm run evaluate:qvac` on the actual five-frame set.
- Record exact hardware, OS, QVAC SDK version, quantization, cold-start time, median latency, and p95 latency in [`SUBMISSION.md`](SUBMISSION.md).
- Document model failures honestly; do not replace the mock label or copy mock scores into the submission.
- Push to a public repository and replace the placeholders in `SUBMISSION.md` with immutable GitHub permalinks to the QVAC integration lines.
- Record an end-to-end local demo with the machine offline after model download.

## Privacy

Frames are read from disk and attached directly to the in-process QVAC completion. The code has no network client and emits only structured parking evidence and traces. It does not identify people, perform license-plate recognition, or retain video. Evaluation media is excluded from this starter by design.
