#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { runParkingAgent } from "./orchestrator.js";
import { createRuntime, projectRoot } from "./runtime.js";

const options = parseArgs(process.argv.slice(2));
const scenarios = JSON.parse(
  await readFile(path.join(projectRoot, "data", "scenarios.json"), "utf8"),
);
const runs = Number(options.runs ?? 5);
if (!Number.isInteger(runs) || runs < 1) throw new Error("--runs must be a positive integer");

const results = [];
let sharedRuntime;
if (options.mode === "qvac") sharedRuntime = await createRuntime({ mode: "qvac" });

try {
  for (const scenario of scenarios) {
    for (let run = 1; run <= runs; run += 1) {
      const runtime = sharedRuntime ?? (await createRuntime({ mode: "mock", scenario }));
      if (sharedRuntime) sharedRuntime.inference.seed = run;
      const started = performance.now();
      try {
        const result = await runParkingAgent(
          {
            camera_id: scenario.camera_id,
            location: scenario.location,
            datetime: scenario.datetime,
          },
          runtime,
        );
        results.push({
          scenario: scenario.id,
          run,
          expected: scenario.expected,
          actual: result.decision,
          passed: result.decision === scenario.expected,
          code: result.code,
          latencyMs: Math.round(performance.now() - started),
          completedTools: result.completedTools,
          rejectedCalls: result.trace.filter((event) => event.type === "rejected_call").length,
        });
      } catch (error) {
        results.push({
          scenario: scenario.id,
          run,
          expected: scenario.expected,
          actual: "ERROR",
          passed: false,
          code: "UNHANDLED_ERROR",
          error: error.message,
          latencyMs: Math.round(performance.now() - started),
          completedTools: [],
          rejectedCalls: 0,
        });
      } finally {
        if (!sharedRuntime) await runtime.close();
      }
    }
  }
} finally {
  if (sharedRuntime) await sharedRuntime.close();
}

const report = buildReport(options.mode, scenarios, runs, results);
console.log(renderMarkdown(report));

if (options.output) {
  const outputBase = path.resolve(options.output).replace(/\.(json|md)$/i, "");
  await mkdir(path.dirname(outputBase), { recursive: true });
  await Promise.all([
    writeFile(`${outputBase}.json`, `${JSON.stringify(report, null, 2)}\n`),
    writeFile(`${outputBase}.md`, renderMarkdown(report)),
  ]);
}

function buildReport(mode, scenarioList, repetitions, runResults) {
  const passed = runResults.filter((result) => result.passed).length;
  const completeChains = runResults.filter((result) => result.completedTools.length === 4).length;
  const latencies = runResults.map((result) => result.latencyMs).sort((a, b) => a - b);
  return {
    generatedAt: new Date().toISOString(),
    mode,
    evidenceClass:
      mode === "qvac"
        ? "LOCAL_QVAC_INFERENCE"
        : "MOCK_ORCHESTRATION_ONLY_NOT_MODEL_EVIDENCE",
    scenarios: scenarioList.length,
    repetitions,
    totalRuns: runResults.length,
    passed,
    successRate: runResults.length ? passed / runResults.length : 0,
    completeChainRate: runResults.length ? completeChains / runResults.length : 0,
    medianLatencyMs: percentile(latencies, 0.5),
    p95LatencyMs: percentile(latencies, 0.95),
    byScenario: scenarioList.map((scenario) => {
      const rows = runResults.filter((result) => result.scenario === scenario.id);
      return {
        id: scenario.id,
        expected: scenario.expected,
        passed: rows.filter((row) => row.passed).length,
        runs: rows.length,
        decisions: countBy(rows, "actual"),
        failures: rows.filter((row) => !row.passed),
      };
    }),
    runs: runResults,
  };
}

function renderMarkdown(report) {
  const label = report.mode === "mock" ? "Mock architecture check" : "Local QVAC evaluation";
  const lines = [
    `# BA Estaciona — ${label}`,
    "",
    `> Evidence class: \`${report.evidenceClass}\`. ${
      report.mode === "mock"
        ? "This checks orchestration and policy code; it is not evidence of model accuracy."
        : "All model inference ran locally through QVAC."
    }`,
    "",
    `- Scenarios: ${report.scenarios}`,
    `- Repetitions per scenario: ${report.repetitions}`,
    `- Correct decisions: ${report.passed}/${report.totalRuns} (${formatPercent(report.successRate)})`,
    `- Complete four-tool chains: ${formatPercent(report.completeChainRate)}`,
    `- Median latency: ${report.medianLatencyMs} ms; p95: ${report.p95LatencyMs} ms`,
    "",
    "| Scenario | Expected | Passed | Decisions |",
    "|---|---:|---:|---|",
    ...report.byScenario.map(
      (row) =>
        `| ${row.id} | ${row.expected} | ${row.passed}/${row.runs} | ${Object.entries(row.decisions)
          .map(([key, value]) => `${key}: ${value}`)
          .join(", ")} |`,
    ),
    "",
  ];
  const failures = report.runs.filter((row) => !row.passed);
  if (failures.length) {
    lines.push("## Failures", "", "```json", JSON.stringify(failures, null, 2), "```", "");
  }
  return `${lines.join("\n")}\n`;
}

function countBy(rows, key) {
  return Object.fromEntries(
    [...new Set(rows.map((row) => row[key]))].map((value) => [
      value,
      rows.filter((row) => row[key] === value).length,
    ]),
  );
}

function percentile(sorted, point) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * point) - 1)];
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function parseArgs(argv) {
  const values = { mode: "mock" };
  for (let index = 0; index < argv.length; index += 2) {
    values[argv[index].replace(/^--/, "")] = argv[index + 1];
  }
  if (!["mock", "qvac"].includes(values.mode)) throw new Error("--mode must be mock or qvac");
  return values;
}
