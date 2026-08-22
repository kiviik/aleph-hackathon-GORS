# Atelier product vision — approved concept screens

This directory contains the current approved product-design reference set for Atelier. The images were generated with OpenAI's built-in ImageGen as high-fidelity interface concepts; they are implementation references, not production UI assets.

## Product direction

Atelier is a connected fashion product-creation operating system:

`market signal → reference → concept → product specification → launch → outcome → reviewed learning`

The interface should preserve professional depth while using progressive disclosure. Each screen has one primary job, one contextual inspector at most, extensive manual control when requested, and a clear distinction between observed evidence, AI interpretation, and authorized human decisions.

## Approved screen set

| File | Workspace | Primary job |
| --- | --- | --- |
| `01-market-radar.png` | Market Radar | Discover product and market signals using visual search, filters, similar-item discovery, trajectory, geographic evidence, provenance, and rights. Promote verified references into collections or Dreamland. |
| `02-inspiration-library.png` | Inspiration Library | Capture, organize, search, annotate, review, and reuse brand archives, market references, supplier materials, user uploads, and AI generations while preserving source and usage history. |
| `03-product-tech-pack.png` | Product / Tech Pack | Author one focused section of an immutable product specification with technical flats, construction callouts, linked components, validation, and explicit insertion of AI-drafted text. |
| `04-collection-retrospective.png` | Learn / Collection Retrospective | Compare plan with actual performance, connect outcomes to the originating concept and tech-pack version, and require human review before a proposed lesson becomes brand memory. |
| `05-style-tech-pack.png` | Product · Style record | Hold the garment between visual intent and the technical document: design lineage, editable facts with per-field provenance, version history, and the exact named reasons a draft cannot be released. |
| `06-pilot-no-evidence.png` | Pilot · No evidence yet | The state a real pilot opens on. Separates "asked and none" from "not run" from "not connected", offers useful manual work immediately, and refuses every commercial claim the evidence cannot support. |

## Visual system

- Warm ivory canvas, ink-black navigation, muted oxblood actions, restrained cobalt for verified evidence, and amber for uncertainty or incomplete work.
- Editorial display typography paired with precise operational typography.
- Fashion imagery and product objects dominate; analytics appear only when they change a decision.
- Calm default views with focused contextual panels instead of permanent control walls.
- No opaque composite scores, magical AI claims, generic SaaS dashboards, or silent AI edits.

## AI and governance

- AI may search, classify, suggest, draft, compare, summarize, and surface risk.
- AI output must remain visibly distinct from observed facts and human-authored data.
- Users can edit or reject AI-generated tags, specifications, forecasts, and proposed learnings.
- AI cannot approve a product, select a supplier, release a factory pack, alter commercial commitments, or save durable brand memory without authorized human action.

## Use note

Generated UI may contain minor typography or microcopy artifacts. During implementation, use this README as the canonical behavioral reference and treat the images as hierarchy, density, and visual-direction guides.


---

## 05 · Product · Style record — and 06 · Pilot · No evidence yet

*Exported 2026-08-17 from `design/atelier-authored-2026-08-17/professional-depth.html`
(screens `#s-style` and `#s-empty`), 1600 CSS px wide at 2× device scale. The
source HTML is the owner's; the export used throwaway copies and did not modify it.*

⚠ **These two were authored AFTER an engine audit, and they are deliberately
harder on the product than 01–04.** Where the earlier set draws a capability,
these two draw a REFUSAL and name what is missing. Read them that way.

### 05 · Style record

**Purpose.** The workspace between visual intent and the factory document. It is
the screen that makes a Style the product record rather than a row.

| | |
|---|---|
| **Manual inputs** | every technical fact — end use, shell composition, care instruction, POMs, construction sections, BOM components. Manual authorship is the base product, not a fallback. |
| **AI inputs** | proposes field values (marked `AI proposed`), drafts specification text from approved sample notes. It never inserts: a person clicks *Insert draft*. |
| **REAL today** | style tree · per-field provenance (`ai_proposed` / `imported` / `calculated` / `human_verified` / `supplier_confirmed`) · version history with one released version (0058) · release gate on human verification (`can_be_quoted`) · quotes per Style (A20.5) · measurement block named on the pack (0077) · design lineage via `parent_asset_id` (0075) and `intent` (0080). |
| **PROPOSED** | construction sections with anchored callouts · BOM lines with consumption and waste · grading rules · costing tab. Each is drawn here and has no engine table. |
| **UNEARNED — do not build from this image** | HS code, compliance tab, care-label locale requirements. No schema, and inventing one to fill the picture is the failure the screen itself argues against. |
| **Critical empty states** | "One required POM is blank — blank is preserved; it is not inferred from another size." · "No current-season quote — this does not block release, but costing and supplier comparison are unavailable." |
| **The human decision that creates commitment** | *Release v7*. It is disabled, and the panel says why in three numbered blockers rather than showing a score. |

⚠ **The screen names a real governance gap and must keep doing so.** "Review
record · separate" carries: *"These signatures are recorded, but they do not gate
release today. This screen does not pretend otherwise."* That is true — 0070's
per-discipline lanes REPORT and do not yet gate. Do not quietly wire the
signatures to the release contract to make the screen tidier; that is a product
decision with its own acceptance criteria.

**Implementation dependencies.** Construction/BOM/grading need tables that do not
exist. Everything else is a screen over shipped contracts — `components/views/StyleRecord.jsx`
implements the six backed tabs and declares the five unbacked ones as `SIN MOTOR`.

### 06 · Pilot · No evidence yet

**Purpose.** What a brand sees before any data arrives. This is the most
commonly faked screen in the category and the one Atelier must get right.

| | |
|---|---|
| **Manual inputs** | collection brief, references with rights recorded, the first Style, its technical record. All available on day one with zero evidence connected. |
| **AI inputs** | none that assert. The screen offers retrieval and authorship, not readings. |
| **REAL today** | the three-state distinction, implemented in `lib/styleRecord.mjs` and `lib/api.js` (`undefined` unresolved · `null` could not ask · `[]` asked and none). |
| **PROPOSED** | "Import files" as a first-run entrance; the Import Centre exists but is buried under Marca & datos. |
| **Critical empty states — the whole screen** | `Catalog asked · none returned` ≠ `Engine · not run` ≠ `Sales · not connected`. Three chips, three colours, three different next actions. Collapsing them into "sin datos" is the defect this screen exists to prevent. |
| **The human decision that creates commitment** | *Create manual workspace* / *Start with a manual brief* — the pilot commits to working, not to a machine's answer. |

**"Atelier refuses to invent"** is a list of five specific refusals (a forecast
without a validated gold set; a best supplier without comparable quotes; a margin
from blank inputs; a measurement inferred from a render; a zero where the real
state is not-connected). Treat it as a specification of forbidden behaviour, not
as copy.

⚠ **"Manual work is not a degraded mode. It is the base product."** If an
implementation makes the manual path feel like the fallback, the implementation
is wrong, not the screen.
