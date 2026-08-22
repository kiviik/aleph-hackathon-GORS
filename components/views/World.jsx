"use client";
// INTELIGENCIA MUNDIAL — the shared forecast, and everything it rests on.
//
// 2026-08-09. The first screen in this app that is not about a brand. Every
// other view resolves a tenant before it can render a number; this one cannot,
// because `world_observations` has no brand column and a test in the engine
// asserts its absence. Two brands opening this screen see the same forecast
// ids, and that is the product rather than a side effect.
//
// THREE THINGS IT REFUSES TO DO, all of them versions of the same mistake.
//
// 1. **It does not compute a verdict.** Trajectory, status, interval and
//    coverage all arrive decided, from a policy row and a publication gate. A
//    threshold applied in the browser is the opinion nobody can trace back to
//    anything, and it would drift from the engine's the first time either
//    changed.
// 2. **It does not hide `indicative` or `refused`.** An indicative forecast is
//    stored, shown and NOT citable; until it could be looked at, only the first
//    of those was true. A feed that showed published rows alone would look
//    healthier than the evidence is, which is the failure this whole layer
//    exists to avoid.
// 3. **It does not fall back to demo data.** `lib/api.js` degrades to bundled
//    fixtures so a disconnected laptop still renders a brand; here that would
//    be plausible-looking market evidence with no source, which is precisely
//    the false intelligence purged on 08-07. No engine, no numbers, and the
//    screen says which.
//
// FRESHNESS IS A FIRST-CLASS FIELD, not a footnote. A world feed's real failure
// mode is not being wrong — it is being three weeks old while looking exactly
// the same. `/world/cycles` answers "did the thing that produces this actually
// run", and that answer is at the top of the screen rather than buried.
import { useCallback, useEffect, useMemo, useState } from "react";

import Icon from "@/components/ui/Icon";
import { useChrome } from "@/components/ui/Chrome";
import {
  MEASUREMENT_LABEL, STATUS_LABEL, TRAJECTORY_LABEL, byTrajectory,
  cycleVerdict, forecastValue, freshness, getCycles, getForecasts, getMarkets,
  latestPerScope,
} from "@/lib/worldApi";

// The order a reader cares about: things that are moving, then things that are
// not, then the honest gap. `insufficient_evidence` sits LAST and is never
// dropped — a market with too little history is a row in the answer.
const TRAJECTORY_ORDER = ["accelerating", "emerging", "peaking", "declining",
                          "flat", "insufficient_evidence"];

const TONE_ICON = { ok: "check", warn: "clock", bad: "warn", unknown: "lock" };

/* ---------------------------------------------------------------- styles -- */

// ⚠ MOUNTED AS `dangerouslySetInnerHTML`, never as a `<style>{CSS}</style>`
// text child: React escapes `>` and `"` when it serialises a text child on the
// server, the browser does not unescape inside <style>, and the mismatch makes
// React throw the whole tree away on every load. See tests/styleHydration.
// ⚠ 11px IS THE FLOOR. Nothing below it, anywhere in this file.
const CSS = `
/* ============ Inteligencia mundial — wd2- ==========================
   The one screen that is NOT about a brand, so the first thing on it
   says so — a night band above every figure, because a world number
   read as your own is the single misreading this layer can produce.
   Everything else is provenance: what ran, when, what it covers, and
   what the gate refused to publish. */

.wd2 {
  min-width: 0; container-type: inline-size; container-name: wd2;
  display: flex; flex-direction: column;
}

/* ---- header ---- */
.wd2-head { margin: 0 0 var(--s3); }
.wd2-eyebrow {
  font-family: var(--d); font-size: 11px; font-weight: 500;
  letter-spacing: .06em; text-transform: uppercase;
  color: var(--editorial); margin: 0 0 var(--s2);
}
.wd2-title {
  font-family: var(--serif); font-size: 36px; font-weight: 600;
  line-height: 1.08; letter-spacing: -.015em; color: var(--ink); margin: 0 0 var(--s2);
}
.wd2-lede {
  font-size: 14px; line-height: 1.55; color: var(--ink-2); margin: 0; max-width: 68ch;
}

/* ---- THE SCOPE BAND. Above every figure, on every branch. ---- */
.wd2-scope {
  display: flex; align-items: flex-start; gap: var(--s2);
  background: var(--night); color: #C9CBD2; border-radius: var(--r-sm);
  padding: 10px 14px; margin: 0 0 var(--s4);
  font-family: var(--d); font-size: 11px; line-height: 1.55;
}
.wd2-scope svg { width: 14px; height: 14px; flex: none; margin-top: 1px; }
.wd2-scope b { color: var(--surface); font-weight: 600; }

/* ---- the counts the feed already computed ---- */
.wd2-counts {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(158px, 1fr));
  gap: 1px; background: var(--hair);
  border: 1px solid var(--line); border-radius: var(--r);
  box-shadow: var(--shadow); overflow: hidden; margin: 0 0 var(--s4);
}
.wd2-count { background: var(--surface); padding: 13px 16px; }
.wd2-count span {
  display: block; font-family: var(--d); font-size: 11px; font-weight: 500;
  letter-spacing: .06em; text-transform: uppercase; color: var(--ink-3);
  margin-bottom: 7px; line-height: 1.35;
}
.wd2-count b {
  display: block; font-family: var(--disp); font-size: 21px; font-weight: 600;
  line-height: 1; letter-spacing: -.01em; font-variant-numeric: tabular-nums;
  color: var(--ink);
}

/* ---- freshness + coverage ---- */
.wd2-top {
  display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
  gap: var(--s3); margin: 0 0 var(--s5); align-items: start;
}
.wd2-fresh {
  display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--s2) 10px;
  background: var(--surface); border: 1px solid var(--line);
  border-left: 3px solid var(--hair-2); border-radius: var(--r);
  box-shadow: var(--shadow); padding: 13px 15px;
}
.wd2-fresh > svg { width: 16px; height: 16px; margin-top: 2px; color: var(--ink-3); }
.wd2-fresh b { display: block; font-size: 13.5px; font-weight: 600; color: var(--ink); }
/* The staleness line itself: mono, quiet, and coloured only when the
   engine's own verdict says something is late. */
.wd2-fresh span {
  display: block; margin-top: 4px; font-family: var(--d); font-size: 11px;
  line-height: 1.55; color: var(--ink-3);
}
.wd2-fresh.ok { border-left-color: var(--positive); }
.wd2-fresh.ok > svg { color: var(--positive); }
.wd2-fresh.warn { border-left-color: var(--warning); }
.wd2-fresh.warn > svg, .wd2-fresh.warn span { color: var(--warning); }
.wd2-fresh.bad { border-left-color: var(--danger); }
.wd2-fresh.bad > svg, .wd2-fresh.bad span { color: var(--danger); }
.wd2-fresh.unknown { border-left-color: var(--hair-2); }

.wd2-failures { grid-column: 2; margin-top: 2px; }
.wd2-failures summary {
  font-family: var(--d); font-size: 11px; color: var(--warning); cursor: pointer;
}
.wd2-failures ul { list-style: none; margin: var(--s2) 0 0; padding: 0; display: grid; gap: 7px; }
.wd2-failures li { display: grid; gap: 2px; }
.wd2-failures code { font-family: var(--d); font-size: 11px; color: var(--ink-2); }
.wd2-failures li span { font-size: 11px; line-height: 1.5; color: var(--ink-3); }

.wd2-cov {
  background: var(--surface); border: 1px solid var(--line);
  border-left: 3px solid var(--hair-2); border-radius: var(--r);
  box-shadow: var(--shadow); padding: 13px 15px;
}
.wd2-cov.partial { border-left-color: var(--warning); }
.wd2-cov-num { display: flex; align-items: baseline; gap: var(--s2); }
.wd2-cov-num b {
  font-family: var(--disp); font-size: 21px; font-weight: 600; line-height: 1;
  letter-spacing: -.01em; font-variant-numeric: tabular-nums; color: var(--ink);
}
.wd2-cov-num span { font-size: 12px; line-height: 1.4; color: var(--ink-2); }
/* The measured bar is the ratio already stated in words, drawn. Nothing
   here is computed that the sentence above it does not already say. */
.wd2-cov-bar {
  display: flex; align-items: center; gap: 10px; margin-top: 11px;
}
.wd2-cov-track {
  flex: 1; height: 8px; border-radius: 99px; background: var(--paper-2); overflow: hidden;
}
.wd2-cov-fill { display: block; height: 100%; background: var(--ink-2); border-radius: 99px; }
.wd2-cov-pct {
  flex: none; min-width: 42px; text-align: right; font-family: var(--d);
  font-size: 12px; font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums;
}
.wd2-cov-why {
  margin: 10px 0 0; font-size: 11.5px; line-height: 1.55; color: var(--ink-3); max-width: 62ch;
}

/* ---- the feed ---- */
.wd2-body { display: block; }
.wd2-feed { display: flex; flex-direction: column; gap: var(--s5); }
.wd2-group { min-width: 0; }
.wd2-group-head {
  display: flex; align-items: center; gap: 10px; margin: 0 0 var(--s3);
  padding: 0 0 8px; border-bottom: 1px solid var(--hair);
  font-family: var(--d); font-size: 11px; font-weight: 500;
  letter-spacing: .06em; text-transform: uppercase; color: var(--ink-3);
}
.wd2-group-head span {
  font-size: 11px; background: var(--paper-2); border-radius: 999px; padding: 2px 9px;
  color: var(--ink-2); font-variant-numeric: tabular-nums;
}
.wd2-group-head.accelerating { color: var(--positive); }
.wd2-group-head.declining { color: var(--warning); }
/* Not styled as an error: a market with too little history is a row in the
   answer, and the owner's own example (Argentina) is the reason it exists. */
.wd2-group-head.insufficient_evidence { color: var(--ink-3); }

.wd2-cards {
  list-style: none; margin: 0; padding: 0;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(238px, 1fr)); gap: var(--s3);
}
.wd2-card { min-width: 0; }
.wd2-card-hit {
  display: block; width: 100%; text-align: left; cursor: pointer;
  padding: 13px 15px; background: var(--card); border: 1px solid var(--line);
  border-left-width: 3px; border-left-color: var(--hair-2);
  border-radius: var(--r); box-shadow: var(--shadow); transition: border-color .14s;
}
.wd2-card-hit:hover { border-color: var(--cobalt); }
/* Published is the only citable state, and the only one that reads as solid. */
.wd2-card.published .wd2-card-hit { border-left-color: var(--positive); }
.wd2-card.indicative .wd2-card-hit { border-left-color: var(--warning); background: var(--paper); }
.wd2-card.refused .wd2-card-hit { border-left-color: var(--danger); }

.wd2-card-head { display: flex; align-items: center; justify-content: space-between; gap: var(--s2); }
.wd2-trend {
  font-size: 13.5px; font-weight: 600; color: var(--ink); min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.wd2-status {
  flex: none; font-family: var(--d); font-size: 11px; font-weight: 600;
  letter-spacing: .04em; text-transform: uppercase;
  padding: 3px 8px; border-radius: 999px;
  background: var(--paper-2); color: var(--ink-3);
}
.wd2-status.published { color: var(--positive); }
.wd2-status.indicative { background: var(--ochre-wash); color: var(--warning); }
.wd2-status.refused { background: var(--clay-wash); color: var(--danger); }

.wd2-axes {
  display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px;
  font-family: var(--d); font-size: 11px; color: var(--ink-3);
}
.wd2-number { margin-top: 11px; display: flex; align-items: baseline; flex-wrap: wrap; gap: 9px; }
.wd2-number b {
  font-family: var(--disp); font-size: 21px; font-weight: 600; line-height: 1;
  letter-spacing: -.01em; color: var(--ink); font-variant-numeric: tabular-nums;
}
.wd2-band { font-family: var(--d); font-size: 11px; color: var(--ink-2); font-variant-numeric: tabular-nums; }
.wd2-number.none span { font-family: var(--d); font-size: 12px; color: var(--ink-3); }
/* An index is not a share. Named on the CARD, not only in the drawer, because
   the card is what gets screenshotted. */
.wd2-unit {
  font-family: var(--d); font-size: 11px; letter-spacing: .04em; text-transform: uppercase;
  color: var(--ink-3); background: var(--paper-2); border-radius: 999px; padding: 2px 7px;
}
.wd2-foot {
  display: flex; align-items: center; justify-content: space-between; gap: var(--s2);
  margin-top: 11px; padding-top: 9px; border-top: 1px solid var(--hair);
  font-family: var(--d); font-size: 11px; color: var(--ink-3);
}
.wd2-weeks { font-variant-numeric: tabular-nums; }
.wd2-nocite { display: inline-flex; align-items: center; gap: 4px; color: var(--warning); }
.wd2-nocite svg { width: 12px; height: 12px; }

/* ---- the drawer. NO side-by-side master-detail: the work column is
       viewport − sidebar − rail, and a 1fr/380px split leaves a 270px
       feed with the detail 900px below the fold. ---- */
.wd2-scrim { position: fixed; inset: 0; background: rgba(26, 24, 21, .28); z-index: 60; }
.wd2-detail {
  position: fixed; top: 0; right: 0; bottom: 0; z-index: 61;
  width: min(460px, 92vw); padding: var(--s5) var(--s4);
  background: var(--surface); border-left: 1px solid var(--line);
  box-shadow: var(--shadow); display: flex; flex-direction: column;
  gap: var(--s4); overflow: auto;
}
.wd2-detail > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.wd2-detail > header b { display: block; font-size: 14px; font-weight: 600; color: var(--ink); }
.wd2-detail > header span {
  display: block; margin-top: 4px; font-family: var(--d); font-size: 11px; color: var(--ink-3);
}
.wd2-close {
  flex: none; padding: 6px; border-radius: var(--r-xs);
  border: 1px solid var(--line); background: var(--card); cursor: pointer;
}
.wd2-close svg { width: 14px; height: 14px; display: block; }
.wd2-detail section h4 {
  margin: 0 0 8px; font-family: var(--d); font-size: 11px; font-weight: 500;
  letter-spacing: .06em; text-transform: uppercase; color: var(--ink-3);
}
.wd2-detail section p { margin: 0; font-size: 12.5px; line-height: 1.6; color: var(--ink-2); }

.wd2-verdict {
  padding: 12px 14px; border-radius: var(--r-sm);
  border-left: 3px solid var(--hair-2); background: var(--paper);
}
.wd2-verdict b { display: block; font-size: 13px; font-weight: 600; color: var(--ink); margin-bottom: 5px; }
.wd2-verdict.published { border-left-color: var(--positive); }
.wd2-verdict.indicative { border-left-color: var(--warning); }
.wd2-verdict.refused { border-left-color: var(--danger); }
.wd2-gate-why { margin-top: 7px !important; font-size: 11.5px !important; color: var(--ink-3) !important; }

.wd2-dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 5px 14px; margin: 0; }
.wd2-dl dt { font-size: 11.5px; color: var(--ink-3); }
.wd2-dl dd {
  margin: 0; font-family: var(--d); font-size: 11.5px; color: var(--ink);
  font-variant-numeric: tabular-nums;
}

.wd2-elig { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 6px; }
.wd2-elig li { font-size: 11px; line-height: 1.5; color: var(--ink-3); }
.wd2-elig code { font-family: var(--d); font-size: 11px; color: var(--ink-2); }

.wd2-seasonal b { font-family: var(--d); font-size: 15px; font-weight: 600; color: var(--ink); }
.wd2-muted { color: var(--ink-3) !important; font-size: 11.5px !important; }
.wd2-assumed {
  display: flex; gap: 8px; margin-top: 9px !important; padding: 10px 12px;
  background: var(--ochre-wash); border-radius: var(--r-sm);
  font-size: 11.5px !important; line-height: 1.55; color: var(--warning) !important;
}
.wd2-assumed svg { width: 14px; height: 14px; flex: none; margin-top: 2px; }

.wd2-detail-foot {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding-top: var(--s3); border-top: 1px solid var(--hair);
  font-family: var(--d); font-size: 11px; color: var(--ink-3);
}
.wd2-detail-foot code { font-family: var(--d); font-size: 11px; }

/* ---- empty and unreachable: calm, centred, serif ---- */
.wd2-empty {
  background: var(--surface); border: 1px dashed var(--hair-2); border-radius: var(--r);
  padding: var(--s7) var(--s5); text-align: center;
}
.wd2-empty svg { width: 20px; height: 20px; color: var(--ink-3); }
.wd2-empty b {
  display: block; font-family: var(--serif); font-size: 24px; font-weight: 600;
  letter-spacing: -.01em; color: var(--ink); margin: var(--s3) 0 var(--s2);
}
.wd2-empty p {
  margin: 0 auto; font-size: 13px; line-height: 1.65; color: var(--ink-2); max-width: 58ch;
}
.wd2-empty code {
  display: inline-block; margin-top: var(--s3);
  font-family: var(--d); font-size: 11px; color: var(--danger);
}
.wd2-empty.bad { border-style: solid; border-left: 3px solid var(--danger); }
.wd2-retry {
  display: inline-block; margin-top: var(--s3);
  border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--surface);
  font-size: 12.5px; font-weight: 600; padding: 9px 18px; cursor: pointer; color: var(--cobalt);
}
.wd2-retry:hover { border-color: var(--cobalt); }
.wd2-loading { font-family: var(--d); font-size: 12px; color: var(--ink-3); padding: var(--s4) 0; }

@container wd2 (max-width: 620px) {
  .wd2-title { font-size: 30px; }
  .wd2-top { grid-template-columns: minmax(0, 1fr); }
  .wd2-cards { grid-template-columns: minmax(0, 1fr); }
}
`;

function Freshness({ cycles }) {
  const latest = cycles?.latest;
  const verdict = cycleVerdict(latest);
  const when = freshness(latest?.finished_at || latest?.started_at);
  return (
    <div className={`wd2-fresh ${verdict.tone}`}>
      <Icon name={TONE_ICON[verdict.tone] || "clock"} />
      <div>
        <b>
          {latest
            ? `Última actualización ${when || "—"}`
            : "El ciclo mundial nunca corrió"}
        </b>
        <span>{verdict.text}</span>
      </div>
      {/* Failures are shown, not counted away. A scheduled feed dies of this
          going unnoticed: the forecasts look fine, they are simply stale. */}
      {latest?.failures?.length > 0 && (
        <details className="wd2-failures">
          <summary>{latest.failures.length} alcance(s) con falla</summary>
          <ul>
            {latest.failures.slice(0, 8).map((f, i) => (
              <li key={i}>
                <code>{f.scope?.trend_id} · {f.scope?.geography}</code>
                <span>{f.error}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Coverage({ markets }) {
  const c = markets?.coverage;
  if (!c) return null;
  const complete = c.declared_markets > 0
    && c.markets_with_evidence === c.declared_markets;
  // The engine's own ratio, drawn. Nothing is derived that the sentence
  // beside it does not already state — and with no declared market there is
  // no denominator, so there is no bar.
  const pct = c.declared_markets > 0
    ? Math.round((c.markets_with_evidence / c.declared_markets) * 100)
    : null;
  return (
    <div className={`wd2-cov${complete ? "" : " partial"}`}>
      <div className="wd2-cov-num">
        <b>{c.markets_with_evidence}</b>
        <span>de {c.declared_markets} mercados con evidencia</span>
      </div>
      {pct != null && (
        <div className="wd2-cov-bar">
          <span className="wd2-cov-track">
            <span className="wd2-cov-fill" style={{ width: `${pct}%` }} />
          </span>
          <span className="wd2-cov-pct">{pct}%</span>
        </div>
      )}
      {/* THE RULE THAT KEEPS THIS PRODUCT CREDIBLE: a roll-up is «mundial» only
          when no declared market is missing. Otherwise the missing ones are
          named, here, on the screen — not only in the stored row. */}
      {!complete && (
        <p className="wd2-cov-why">
          Sin datos en: {c.uncovered?.join(" · ") || "—"}. Nada de esto puede
          llamarse «mundial»: es una lectura de los mercados cubiertos.
        </p>
      )}
      {c.weight_bases_available?.length === 0 && (
        <p className="wd2-cov-why">
          Ninguna región tiene un peso medido, así que toda agregación trata a
          todos los mercados como igual de grandes — y lo dice.
        </p>
      )}
    </div>
  );
}

function ForecastCard({ forecast, onOpen }) {
  // ⚠ THE MEASUREMENT DECIDES THE UNIT. This used to be `sharePct` for every
  // forecast, so an ATTENTION INDEX of 42 rendered as «4200%» — the exact
  // confusion the observation contract exists to prevent, reintroduced on the
  // way out of the engine.
  const unit = forecast.measurement;
  const point = forecastValue(forecast.point, unit);
  const lower = forecastValue(forecast.lower, unit);
  const upper = forecastValue(forecast.upper, unit);
  const citable = forecast.citable;
  return (
    <li className={`wd2-card ${forecast.status}`}>
      <button className="wd2-card-hit" onClick={() => onOpen(forecast)}>
        <div className="wd2-card-head">
          <b className="wd2-trend">{forecast.trend_id}</b>
          <span className={`wd2-status ${forecast.status}`}>
            {STATUS_LABEL[forecast.status] || forecast.status}
          </span>
        </div>

        <div className="wd2-axes">
          <span>{forecast.geography}</span>
          <span>·</span>
          <span>{forecast.channel}</span>
          <span>·</span>
          <span>{forecast.horizon_weeks} semanas</span>
        </div>

        {/* A POINT IS NEVER SHOWN WITHOUT ITS BAND. The engine will not store
            one — a check constraint says so — and the screen must not
            reintroduce it by rendering `point` and dropping the interval. */}
        {point && lower && upper ? (
          <div className="wd2-number">
            <b>{point}</b>
            <span className="wd2-band">{lower} – {upper}</span>
            {/* An index is not a share and must not be read as one. Named on
                the card rather than only in the drawer, because the card is
                where the number gets screenshotted. */}
            {unit === "index" && <span className="wd2-unit">índice</span>}
          </div>
        ) : (
          <div className="wd2-number none">
            <span>sin intervalo medido</span>
          </div>
        )}

        <div className="wd2-foot">
          <span className="wd2-weeks">{forecast.weeks_observed || 0} semanas observadas</span>
          {!citable && (
            <span className="wd2-nocite" title="no puede citarse en una decisión de marca">
              <Icon name="lock" />no citable
            </span>
          )}
        </div>
      </button>
    </li>
  );
}

function Detail({ forecast, onClose }) {
  const cal = forecast.interval_calibration || {};
  const gate = forecast.gate || {};
  const seasonality = gate.seasonality;
  const precision = gate.sampling_precision;
  const calendar = gate.calendar;

  return (
    <aside className="wd2-detail">
      <header>
        <div>
          <b>{forecast.trend_id}</b>
          <span>{forecast.geography} · {forecast.channel} · {forecast.horizon_weeks} sem</span>
        </div>
        <button className="wd2-close" onClick={onClose} aria-label="Cerrar">
          <Icon name="close" />
        </button>
      </header>

      {/* WHY THIS IS OR IS NOT CITABLE, in the engine's own words. The screen
          does not restate the rule; it shows the verdict and the reasons the
          gate recorded, so a reader can argue with the policy rather than with
          the interface. */}
      <section className={`wd2-verdict ${forecast.status}`}>
        <b>{STATUS_LABEL[forecast.status] || forecast.status}</b>
        <p>
          {forecast.citable
            ? "Una decisión de marca puede citar este pronóstico."
            : "Se muestra y no se cita: una marca no puede construir sobre una incertidumbre que nadie midió."}
        </p>
        {gate.why && <p className="wd2-gate-why">{gate.why}</p>}
      </section>

      <section>
        <h4>Qué es este número</h4>
        <p className="wd2-muted">
          {MEASUREMENT_LABEL[forecast.measurement] || forecast.measurement || "—"}
        </p>
      </section>

      <section>
        <h4>El modelo que habló</h4>
        <dl className="wd2-dl">
          <dt>Modelo</dt><dd>{gate.model || "—"}</dd>
          <dt>Le ganó al baseline</dt>
          <dd>{gate.beat_baseline ? "sí" : "no — se usa el baseline"}</dd>
          <dt>Cortes evaluados</dt><dd>{gate.folds ?? "—"}</dd>
          <dt>Ponderado por</dt><dd>{gate.weighted_by || "—"}</dd>
        </dl>
        {/* WHO DID NOT COMPETE. A contest of two that reports only its winner
            is indistinguishable from a contest of six. */}
        {gate.fold_eligibility && (
          <ul className="wd2-elig">
            {Object.entries(gate.fold_eligibility)
              .filter(([, v]) => !v.eligible)
              .map(([id, v]) => (
                <li key={id}><code>{id}</code> {v.why}</li>
              ))}
          </ul>
        )}
      </section>

      {/* THE TIME AXIS, because "104 semanas" means something different when
          eleven of them are missing and a reader cannot tell from the count. */}
      {calendar && (
        <section>
          <h4>El eje de tiempo</h4>
          <dl className="wd2-dl">
            <dt>Semanas</dt><dd>{calendar.weeks}</dd>
            <dt>Abarca</dt><dd>{calendar.span_weeks} semanas de calendario</dd>
            <dt>Faltantes</dt><dd>{calendar.missing_weeks}</dd>
            <dt>Semanas con varias fuentes</dt><dd>{calendar.multi_source_weeks}</dd>
          </dl>
        </section>
      )}

      {seasonality && (
        <section>
          <h4>¿Este mercado es estacional?</h4>
          {seasonality.measurable ? (
            <p className="wd2-seasonal">
              <b>{Math.round((seasonality.strength || 0) * 100)}%</b> de la
              varianza residual la explica el ciclo anual. {seasonality.why}
            </p>
          ) : (
            <p className="wd2-muted">{seasonality.why}</p>
          )}
        </section>
      )}

      <section>
        <h4>El intervalo, y si cubrió</h4>
        {cal.measured_coverage != null ? (
          <p>
            Cobertura medida <b>{Math.round(cal.measured_coverage * 100)}%</b>
            {" "}contra un nivel declarado de {Math.round((cal.nominal_level || 0) * 100)}%,
            sobre {cal.coverage_checked_on_folds} cortes que no eligieron el
            modelo ni construyeron la banda.
          </p>
        ) : (
          <p className="wd2-muted">{cal.why || "no se midió cobertura"}</p>
        )}
      </section>

      {/* THE TWO WEIGHTS THAT MUST NEVER BECOME ONE — shown apart on the screen
          too, because a reader who sees one number will assume it is both. */}
      {precision && (
        <section>
          <h4>Precisión de muestreo</h4>
          <p className="wd2-muted">{precision.note}</p>
          {precision.assumed_design_effects?.length > 0 && (
            <p className="wd2-assumed">
              <Icon name="warn" />
              Efecto de diseño no medido en: {precision.assumed_design_effects.join(", ")}.
              Los pesos descansan en un supuesto, y por eso este número no se cita.
            </p>
          )}
        </section>
      )}

      <footer className="wd2-detail-foot">
        <span>evidencia hasta {forecast.evidence_cutoff || "—"}</span>
        <code>{forecast.id}</code>
      </footer>
    </aside>
  );
}

export default function World() {
  const [state, setState] = useState({ loading: true, error: null });
  const [forecasts, setForecasts] = useState([]);
  const [markets, setMarkets] = useState(null);
  const [cycles, setCycles] = useState(null);
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    setState({ loading: true, error: null });
    try {
      const [f, m, c] = await Promise.all([
        getForecasts({ limit: 200 }), getMarkets(), getCycles(1),
      ]);
      // ONE CURRENT ANSWER PER SCOPE. The endpoint returns stored rows in any
      // state, which is right for the endpoint and wrong for a feed: a scope
      // forecast weekly for a year is fifty-two rows, fifty-one superseded.
      setForecasts(latestPerScope(f?.forecasts || []));
      setMarkets(m);
      setCycles(c);
      setState({ loading: false, error: null });
    } catch (err) {
      // No demo fallback, on purpose — see the module header.
      setState({ loading: false, error: String(err.message || err) });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Escape closes the drawer. A panel that covers the screen and can only be
  // dismissed by finding a small button is a trap on a screen meant for
  // reading.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setOpen(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const groups = useMemo(() => byTrajectory(forecasts), [forecasts]);
  const citable = forecasts.filter((f) => f.citable).length;
  const indicative = forecasts.filter((f) => f.status === "indicative").length;
  const coverage = markets?.coverage;
  const latest = cycles?.latest;

  // ⚠ DEPS ARE VALUES, NEVER FUNCTIONS. A function defined in render has a new
  // identity every pass, the effect re-sets the chrome slots, the shell
  // re-renders, and the app hits "Maximum update depth exceeded" forever.
  useChrome({
    read: state.error
      ? null
      : {
          interpretation: forecasts.length
            ? `${forecasts.length} pronóstico(s) guardados, de los cuales ${citable} pueden citarse en una decisión de marca y ${indicative} se muestran sin ser citables. Esta pantalla no evalúa nada: la trayectoria, el estado y la banda llegan decididos por una política registrada y una compuerta de publicación.`
            : "La cañería está completa y vacía. Lo que falta es evidencia, no código.",
          signals: [
            { icon: "check", label: "Citables", text: String(citable) },
            { icon: "lock", label: "Indicativos", text: String(indicative) },
            ...(coverage
              ? [{ icon: "globe", label: "Mercados con evidencia",
                   text: `${coverage.markets_with_evidence} de ${coverage.declared_markets}` }]
              : []),
          ],
          unknowns: [
            ...(coverage?.uncovered?.length
              ? [`Sin datos en ${coverage.uncovered.join(", ")}. Nada de esto puede llamarse «mundial»: es una lectura de los mercados cubiertos.`]
              : []),
            ...(coverage?.weight_bases_available?.length === 0
              ? ["Ninguna región tiene un peso medido, así que toda agregación trata a todos los mercados como igual de grandes."]
              : []),
            ...(latest?.failures?.length
              ? [`El último ciclo perdió ${latest.failures.length} alcance(s). Un feed que envejece sin avisar es la forma en que este producto falla.`]
              : []),
            // ⚠ SEPARATE FROM THE FAILURES, AND USUALLY THE BIGGER NUMBER. When
            // a source rate limits, the engine records ONE failure and defers
            // every remaining scope on that provider — so the failure count
            // alone would report "perdió 1 alcance" for a pass that never asked
            // seventeen. The deferrals are the size of the hole in the evidence.
            ...(latest?.deferred?.length
              ? [`${latest.deferred.length} alcance(s) no se consultaron: la fuente pidió que dejáramos de llamarla y el ciclo se detuvo antes de recorrer la lista. No fallaron — nadie los preguntó.`]
              : []),
          ],
          trace: [
            { icon: "globe", label: "Alcance",
              text: "capa mundial compartida — ninguna marca la dispara y ninguna es dueña de sus fallas" },
            { icon: "shield", label: "Regla",
              text: "sólo «publicado» es citable; «indicativo» se muestra y no se cita" },
          ],
        }
  }, [forecasts.length, citable, indicative, coverage?.markets_with_evidence,
      coverage?.declared_markets, latest?.failures?.length,
      latest?.deferred?.length, state.error]);

  // ⚠ EVERY BRANCH RETURNS THROUGH HERE, so the stylesheet and the scope band
  // are on the screen before anything else is — including while it loads and
  // when it fails. A previous screen shipped an unstyled first paint by
  // returning early past its own <style>.
  const frame = (children) => (
    <div className="wd2">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="wd2-head">
        <div className="wd2-eyebrow">Inteligencia · Capa mundial</div>
        <h1 className="wd2-title">Inteligencia mundial</h1>
        <p className="wd2-lede">
          Pronósticos guardados con su intervalo, su estado y la compuerta que
          decidió si pueden citarse. Esta pantalla no evalúa nada: la trayectoria,
          el estado y la banda llegan decididos por una política registrada.
        </p>
      </div>
      {/* NOT THIS BRAND'S DATA, and above every figure on the screen. */}
      <div className="wd2-scope">
        <Icon name="globe" />
        <span>
          <b>Capa mundial compartida.</b> No son datos de tu marca: ninguna marca
          la dispara, ninguna es dueña de sus fallas, y dos marcas que abren esta
          pantalla ven exactamente los mismos pronósticos.
        </span>
      </div>
      {children}
    </div>
  );

  if (state.loading) {
    return frame(<p className="wd2-loading">Leyendo el mundo…</p>);
  }

  if (state.error) {
    return frame(
      <div className="wd2-empty bad">
        <Icon name="warn" />
        <b>No se pudo leer la capa mundial.</b>
        <p>
          Esta pantalla no tiene datos de demostración. Evidencia de mercado
          verosímil sin fuente es exactamente lo que no queremos mostrar, así
          que no se muestra nada.
        </p>
        <code>{state.error}</code>
        <button className="wd2-retry" onClick={load}>Reintentar</button>
      </div>,
    );
  }

  return frame(
    <>
      {forecasts.length > 0 && (
        <div className="wd2-counts">
          <div className="wd2-count">
            <span>pronósticos guardados</span>
            <b>{forecasts.length}</b>
          </div>
          <div className="wd2-count">
            <span>citables en una decisión</span>
            <b>{citable}</b>
          </div>
          <div className="wd2-count">
            <span>indicativos, no citables</span>
            <b>{indicative}</b>
          </div>
        </div>
      )}

      <div className="wd2-top">
        <Freshness cycles={cycles} />
        <Coverage markets={markets} />
      </div>

      {forecasts.length === 0 ? (
        <div className="wd2-empty">
          <Icon name="lock" />
          <b>Todavía no hay pronósticos guardados.</b>
          <p>
            La cañería está completa y vacía: hace falta que el ciclo mundial
            corra sobre fuentes con evidencia. Eso es un problema de datos, no
            de código.
          </p>
        </div>
      ) : (
        <div className="wd2-body">
          <div className="wd2-feed">
            {TRAJECTORY_ORDER.filter((k) => groups.has(k)).map((key) => (
              <section key={key} className="wd2-group">
                <h3 className={`wd2-group-head ${key}`}>
                  {TRAJECTORY_LABEL[key] || key}
                  <span>{groups.get(key).length}</span>
                </h3>
                <ul className="wd2-cards">
                  {groups.get(key).map((f) => (
                    <ForecastCard key={f.id} forecast={f} onOpen={setOpen} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
          {open && (
            <>
              <div className="wd2-scrim" onClick={() => setOpen(null)} />
              <Detail forecast={open} onClose={() => setOpen(null)} />
            </>
          )}
        </div>
      )}
    </>,
  );
}
