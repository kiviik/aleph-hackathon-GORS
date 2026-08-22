"use client";
// The one export control, dropped into any surface's header. Two universal
// actions over the rows a view already has: download a CSV (opens in
// Excel/Sheets/Numbers) or copy as TSV (pastes straight into a spreadsheet).
// Owner: "everything can be exported to a spreadsheet or whatever tool they
// use" — so this stays format-neutral and lives next to the data it exports.
//
// Props:
//   filename   base name; the util stamps it dated + slugged
//   rows       the array the view rendered (already fetched, no refetch)
//   columns    optional column spec (see lib/export.js); omit = keys of row 0
//   label      optional short label for the group (e.g. "12 categorías")
//   fetchRows  optional async () => rows[]. When the view only holds a PAGE of
//              a larger filtered set, this fetches the COMPLETE set at export
//              time so the file is never a silent partial. Falls back to `rows`
//              if it returns nothing.
import { useState } from "react";

import { downloadCSV, copyForSpreadsheet } from "../lib/export";

export default function ExportButton({ filename, rows, columns, label, fetchRows }) {
  const [copied, setCopied] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const n = Array.isArray(rows) ? rows.length : 0;
  const empty = n === 0;

  // Resolve the rows to export: the full set when a fetcher is supplied
  // (so we never export just the loaded pages), else what the view holds.
  async function resolveRows() {
    if (!fetchRows) return rows;
    setPreparing(true);
    try {
      const all = await fetchRows();
      return Array.isArray(all) && all.length ? all : rows;
    } finally {
      setPreparing(false);
    }
  }

  async function onDownload() {
    if (empty || preparing) return;
    downloadCSV(filename, await resolveRows(), columns);
  }

  async function onCopy() {
    if (empty || preparing) return;
    const ok = await copyForSpreadsheet(await resolveRows(), columns);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  }

  return (
    <span className="xp" title={empty ? "nada para exportar todavía" : undefined}>
      <style dangerouslySetInnerHTML={{ __html: `
        .xp{display:inline-flex;align-items:center;gap:6px}
        .xp-lbl{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-3)}
        .xp-btn{display:inline-flex;align-items:center;gap:5px;font:inherit;font-size:11px;font-weight:700;
          color:var(--ink);background:var(--paper-2);border:1px solid transparent;border-radius:6px;
          padding:4px 9px;cursor:pointer;line-height:1;transition:background .12s,color .12s}
        .xp-btn:hover:not(:disabled){background:var(--cobalt);color:#fff}
        .xp-btn:disabled{opacity:.4;cursor:not-allowed}
        .xp-btn.ok{background:var(--sage);color:#fff}
        .xp-ic{font-size:12px}
      ` }} />
      {label && !empty && <span className="xp-lbl">{label}</span>}
      <button className="xp-btn" disabled={empty || preparing} onClick={onDownload}
              title="Descargar CSV completo del filtro actual (Excel · Sheets · Numbers)">
        <span className="xp-ic">↓</span> {preparing ? "preparando…" : "CSV"}
      </button>
      <button className={`xp-btn${copied ? " ok" : ""}`} disabled={empty || preparing} onClick={onCopy}
              title="Copiar como tabla — pegá en una planilla">
        <span className="xp-ic">{copied ? "✓" : "⧉"}</span> {copied ? "copiado" : "copiar"}
      </button>
    </span>
  );
}
