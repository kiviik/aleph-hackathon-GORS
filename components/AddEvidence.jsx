"use client";
// Link a market observation to the collection's brief — as evidence, on the
// server, immediately.
//
// Priority 4 of the 2026-07-24 review: "the browser should pass an evidence-link
// ID, not serialize a 'brief-like' object into localStorage." This is the
// control that ends the last localStorage handoff in the collection loop.
//
// Three positions, all first-class. `contradicts` is not a courtesy: a brief
// that records only agreeing evidence is marketing, and the engine stores the
// position so the disagreement survives into the decision record.
//
// Everything it writes is pinned — the snapshot the claim was read from, when
// the market did it (`observed_at`) and when Atelier learned it (`ingested_at`).
// A re-crawl that changes a price must not silently change what the brief was
// argued from.
import { useState } from "react";

import { useCollection } from "@/components/CollectionProvider";
import { useEngine, useBrandId } from "@/components/EngineProvider";
import {
  addEvidence, createBrief, createSnapshot, newVersion,
} from "@/lib/collectionBrief";
import { getWorkspace } from "@/lib/workspace";

const POSITIONS = [
  { key: "supports", label: "Apoya", hint: "argumenta a favor" },
  { key: "contradicts", label: "Contradice", hint: "argumenta en contra" },
  { key: "context", label: "Contexto", hint: "ni a favor ni en contra" },
];

export default function AddEvidence({ evidence, compact = false }) {
  const engine = useEngine();
  const { activeId, active } = useCollection();
  const brandId = useBrandId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [needsVersion, setNeedsVersion] = useState(null);

  if (!brandId || !activeId || !evidence?.evidence_id) return null;

  // Resolve the version that can still receive evidence. An APPROVED brief
  // cannot: its evidence is part of what was approved, and appending to it
  // afterwards would let the justification grow to fit the decision. So the
  // team is asked to open the next version rather than having one opened for
  // them behind their back.
  async function targetVersion({ autoOpen = false } = {}) {
    const ws = await getWorkspace(brandId, activeId);
    if (!ws.brief?.id) {
      const brief = await createBrief(brandId, activeId, {});
      return { versionId: brief.latest.id, briefId: brief.id };
    }
    if (ws.brief.open_version) {
      return { versionId: ws.brief.open_version.id, briefId: ws.brief.id };
    }
    if (autoOpen) {
      const v = await newVersion(brandId, ws.brief.id, {});
      return { versionId: v.id, briefId: ws.brief.id };
    }
    return { versionId: null, briefId: ws.brief.id,
             blocked: `v${ws.brief.active_version.version_number} está aprobada` };
  }

  async function link(position, autoOpen = false) {
    setBusy(true); setMsg(""); setNeedsVersion(null);
    try {
      const { versionId, briefId, blocked } = await targetVersion({ autoOpen });
      if (!versionId) {
        setNeedsVersion({ briefId, blocked, position });
        setBusy(false);
        return;
      }
      // Snapshot FIRST. The link records that this brief cited something; the
      // snapshot records what that something said. Without the second, "pinned"
      // is a word rather than a property — and the engine will refuse to
      // approve a brief carrying an unsnapshotted link.
      const snap = await createSnapshot(brandId, {
        subject_type: evidence.evidence_type,
        subject_id: String(evidence.evidence_id),
        payload: evidence.payload || null,
        observed_at: evidence.observed_at || null,
        source_revision: evidence.source_revision || null,
      });
      await addEvidence(brandId, versionId, {
        evidence_type: evidence.evidence_type,
        evidence_id: String(evidence.evidence_id),
        evidence_snapshot_id: snap.id,
        relevance: evidence.relevance || null,
        position,
        observed_at: evidence.observed_at || null,
        source_revision: evidence.source_revision || null,
      });
      setMsg(`Enlazada al brief de ${active?.name || "la colección"}.`);
      setOpen(false);
    } catch (e) {
      setMsg(`El motor rechazó el enlace: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  if (msg && !open) {
    return <span className="ae-done" onClick={() => setMsg("")}>{msg}</span>;
  }

  if (needsVersion) {
    return (
      <div className="ae-block">
        <span>
          {needsVersion.blocked} — su evidencia es parte de lo que se aprobó.
        </span>
        <button disabled={busy} onClick={() => link(needsVersion.position, true)}>
          Abrir la siguiente versión y enlazar
        </button>
        <button className="ae-x" onClick={() => setNeedsVersion(null)}>cancelar</button>
      </div>
    );
  }

  if (!open) {
    return (
      <button className={`ae-open${compact ? " compact" : ""}`}
              onClick={() => setOpen(true)}
              title={`Enlazar como evidencia del brief de ${active?.name || ""}`}>
        + evidencia del brief
      </button>
    );
  }

  return (
    <div className="ae">
      {POSITIONS.map((p) => (
        <button key={p.key} className={`ae-pos ${p.key}`} disabled={busy}
                title={p.hint} onClick={() => link(p.key)}>
          {p.label}
        </button>
      ))}
      <button className="ae-x" onClick={() => setOpen(false)}>×</button>
    </div>
  );
}
