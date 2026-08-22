// One export system for every surface (owner: "everything, one system → CSV /
// spreadsheet"). Turns the rows a view already fetched into a clean, universal
// table: a UTF-8 CSV that opens in Excel/Sheets/Numbers, or a TSV on the
// clipboard that pastes straight into a spreadsheet cell. No backend round-trip,
// no lock-in — whatever tool they use reads these.
//
// A column spec is an array of { key, header, get? }:
//   - key:    property on the row (and the fallback header)
//   - header: the column title written to the file (defaults to key)
//   - get:    (row) => value, for computed/nested/flattened columns
// A bare string is shorthand for { key, header: key }. Omit columns entirely
// and the keys of the first row are used, in order.

function normalizeColumns(columns, rows) {
  if (columns && columns.length) {
    return columns.map((c) =>
      typeof c === "string" ? { key: c, header: c } : { header: c.key, ...c });
  }
  const first = rows.find((r) => r && typeof r === "object");
  return first ? Object.keys(first).map((k) => ({ key: k, header: k })) : [];
}

function cellValue(row, col) {
  const v = col.get ? col.get(row) : row[col.key];
  if (v == null) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") return JSON.stringify(v); // arrays/objects: keep, don't drop
  return String(v);
}

function escapeCell(s, delim) {
  // Quote when the value could break the row: the delimiter, quotes, or a
  // newline. A leading =/+/-/@ is prefixed with a quote-safe apostrophe so
  // spreadsheets don't execute it as a formula (CSV-injection hygiene).
  let out = s;
  if (/^[=+\-@]/.test(out)) out = "'" + out;
  if (out.includes(delim) || out.includes('"') || /[\r\n]/.test(out)) {
    out = '"' + out.replace(/"/g, '""') + '"';
  }
  return out;
}

export function toDelimited(rows, columns, delim) {
  const cols = normalizeColumns(columns, rows || []);
  const lines = [cols.map((c) => escapeCell(c.header, delim)).join(delim)];
  for (const row of rows || []) {
    lines.push(cols.map((c) => escapeCell(cellValue(row, c), delim)).join(delim));
  }
  return lines.join("\r\n"); // CRLF: the line ending Excel expects
}

export const toCSV = (rows, columns) => toDelimited(rows, columns, ",");
export const toTSV = (rows, columns) => toDelimited(rows, columns, "\t");

// A dated, slugged filename so exports self-describe and don't collide:
// "atelier_precios-mercado_2026-07-22.csv".
export function exportFilename(base, ext = "csv") {
  const slug = String(base || "export")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const day = new Date().toISOString().slice(0, 10);
  return `atelier_${slug}_${day}.${ext}`;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Download a CSV. The leading BOM makes Excel read UTF-8 correctly, so Spanish
// accents in category names survive the round-trip.
export function downloadCSV(base, rows, columns) {
  const blob = new Blob(["﻿" + toCSV(rows, columns)],
    { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, exportFilename(base, "csv"));
}

// Copy the table as TSV — pasting into a spreadsheet lands each value in its own
// cell. Falls back to a hidden textarea where the async clipboard API is
// unavailable (http, older browsers). Returns true on success.
export async function copyForSpreadsheet(rows, columns) {
  const tsv = toTSV(rows, columns);
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(tsv);
      return true;
    }
  } catch {
    // fall through to the textarea path
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = tsv;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
