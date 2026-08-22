# BA Estaciona — submission sheet

## Track

QVAC Track 2 — Small models, hard tasks: tool use and reliability.

## One-line pitch

An offline local agent that answers “Can I park here now?” only after chaining visual evidence, a local sector lookup, time-sensitive rules, and a validated final decision—and refuses when the evidence is unsafe.

## QVAC integration permalinks

Replace these after pushing the final commit to a public repository:

- Model loading and local completion: `PERMALINK_REQUIRED`
- Multimodal local frame attachment: `PERMALINK_REQUIRED`
- Tool-call parsing: `PERMALINK_REQUIRED`
- Final local QVAC decision: `PERMALINK_REQUIRED`

## Models and machine

| Field | Value |
|---|---|
| QVAC SDK | `@qvac/sdk` 0.17.1 |
| Tool/decision model | `QWEN3_1_7B_INST_Q4` |
| Vision model | `SMOLVLM2_500M_MULTIMODAL_Q8_0` + matching projection |
| Hardware | `REQUIRED` |
| RAM | `REQUIRED` |
| OS | `REQUIRED` |
| Cold-start/model-load time | `REQUIRED` |
| Median end-to-end latency | `REQUIRED` |
| p95 end-to-end latency | `REQUIRED` |

## Reliability result

Attach `reports/qvac-local.md` and summarize:

- Scenarios × repetitions: `30 × 5`
- Correct decisions: `REQUIRED`
- Complete tool chains: `REQUIRED`
- Refusal correctness: `REQUIRED`
- Failures that remain: `REQUIRED — list all, including malformed tool calls and vision errors`

The checked-in mock report is not model evidence and must not be reported as the QVAC score.

## Demo sequence

1. Disconnect the network after the one-time model download.
2. Show the process list/network monitor and local files.
3. Run a clear, free, allowed scenario.
4. Run a clear, free, prohibited loading-window scenario.
5. Run a dark or occluded scenario and show refusal.
6. Open the full audit trace and one rejected/retried tool call.
7. Show the 30 × 5 QVAC evaluation table and a real failure.
