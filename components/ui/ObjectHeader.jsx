"use client";
// The identity block every versioned object wears: what it is, which version,
// what state, who signed it, and what you can do about it.
//
// WHY THIS EXISTS. Owner design audit, 2026-08-12: *"Every versioned object
// currently scatters its identity as prose — 'BRIEF APROBADO · VERSIÓN 1'
// small-caps here, 'v1 · rev 2' there, approver in a corner, stage tabs saying
// something else (and sometimes something stale)."* PLM screens have one header
// block, in one place, on every object. It is the single component that most
// changes whether this reads as a tool or a lookbook.
//
// ⚠ THE VERSION PICKER IS THE POINT, NOT DECORATION. The engine is append-only:
// briefs, plan versions and concept versions are immutable rows that supersede
// rather than overwrite. The UI has been MENTIONING that ("v1 aprobada") while
// giving nobody a way to go and look at v1. An append-only ledger you cannot
// navigate is a claim about rigour rather than an instance of it.
//
// ⚠ IT RENDERS WHAT IT IS GIVEN AND DERIVES NOTHING. No "probably approved", no
// inferred approver. A header is the last place to guess: this is the block a
// person reads to decide whether they are allowed to act.
import StatusChip from "@/components/ui/StatusChip";
import Icon from "@/components/ui/Icon";

function fmtDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}

export default function ObjectHeader({
  kind,              // "Brief" · "Plan de rango" · "Concepto"
  name,              // the collection / object name
  status,            // the engine's status string
  frozen = false,
  blocked = false,
  versions = [],     // [{ id, version_number, status }] newest first
  activeVersionId,
  onSelectVersion,
  approvedBy,
  approvedByVerified = false,
  approvedAt,
  derivedFrom,       // "Gobernado por Brief v1 (aprobado 12 ago — Vicky Rauch)"
  actions,           // right-aligned nodes
}) {
  const active = versions.find((v) => v.id === activeVersionId) || versions[0] || null;
  const when = fmtDate(approvedAt);

  return (
    <header className="ui-objhead">
      <div className="ui-objhead-top">
        <h1 className="ui-objhead-title">
          {name}{kind ? <span className="ui-objhead-kind"> — {kind}</span> : null}
        </h1>

        {versions.length > 0 && (
          <label className="ui-objhead-versions">
            <span className="sr-only">Versión</span>
            <select
              value={active?.id || ""}
              onChange={(e) => onSelectVersion?.(e.target.value)}
              disabled={versions.length < 2 || !onSelectVersion}
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.version_number}
                </option>
              ))}
            </select>
          </label>
        )}

        <StatusChip status={status} frozen={frozen} blocked={blocked} />

        <div className="ui-objhead-actions">{actions}</div>
      </div>

      {/* The attribution line. ⚠ `approvedByVerified` is rendered as its own
          fact rather than folded into the name: the engine draws a hard line
          between an approval signed by a verified identity and a string
          somebody typed, and a header that blurred them would undo the reason
          that distinction exists. */}
      {(approvedBy || when || derivedFrom) && (
        <div className="ui-objhead-meta">
          {approvedBy && (
            <span>
              Aprobó <b>{approvedBy}</b>
              {approvedByVerified
                ? <em className="ui-verified" title="identidad verificada por el motor">
                    <Icon name="check" /> identidad verificada
                  </em>
                : <em className="ui-unverified" title="nombre sin identidad verificada">
                    sin identidad verificada
                  </em>}
            </span>
          )}
          {when && <span>{when}</span>}
          {derivedFrom && <span className="ui-objhead-derived">{derivedFrom}</span>}
        </div>
      )}
    </header>
  );
}
