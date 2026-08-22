# Reference set — owner's PLM-shaped mockups, 2026-08-14

The second reference set (the first is `../atelier-redesign/`, 2026-08-13). These
are considerably more advanced: they show Atelier as a **fashion PLM with an
intelligence layer**, at the density of Centric / WGSN / EDITED, and they are
the standard the owner is measuring the product against — *"I still think we are
missing cool things from here. We still don't look like it."*

**The images are design reference, not repo assets** — like `../atelier-redesign/`,
they live in the working tree and stay out of git. This file is the durable
half of the pair: it is written to stand on its own, so the descriptions and
verdicts below are readable with no image beside them. If you do drop the PNGs
in, use the filenames in the table and this becomes their index too.

## Why this file exists rather than only the images

Every mock mixes three kinds of element, and telling them apart is the whole
value:

| | |
|---|---|
| **REAL** | the engine already stores it; only the surface is missing |
| **BLOCKED** | a real capability, named engine gap in the way |
| **UNEARNED** | the display implies a computation we do not run — build the computation, then draw it |

⚠ **A CORRECTION TO THE FIRST VERSION OF THIS FILE.** The third bucket was
originally called UNSUPPORTED and glossed *"no source could back it — do not
copy."* That was wrong, and wrong in the direction that costs the most.

Almost everything in it is standard professional practice. Hero / core / entry
is ordinary range-planning vocabulary — a hero style is expected to carry
30–40% of unit sales. Assortment gap analysis is an entire product category
(Profitmind, DataWeave, ClearDemand) and "whitespace" is defined in the trade
almost exactly as `07` draws it: a price tier or subcategory the range does not
serve. Drops are how the industry actually ships. Coverage and confidence
figures are real outputs of real pipelines at the platforms these mocks
resemble.

The question those verdicts should have asked is not *"is this concept real?"*
(it nearly always is) but *"can our engine back it today?"* (it often cannot).
Answering the second while labelling it the first turns a **backlog into a
prohibition** — it tells the next session *don't build this, it's a lie*, when
the truth is *this is table stakes, and here is what it costs.*

What survives is narrower and worth keeping. When a professional platform shows
"52% global coverage", a pipeline it built computed that number. The figure is
not dishonest because it is a figure; it is dishonest only if **we** draw it
without the pipeline. So the rule is not *refuse the certainty*. It is **earn
the certainty** — and until it is earned, state the absence instead of
estimating past it.

## The set

| File | Screen | What it shows |
|---|---|---|
| `01-inteligencia-mundo.png` | Inteligencia · Mundo | A single trend (*Barrel-leg denim*) as a full research page: observed-vs-forecast trajectory with an uncertainty cone, regional heat grid with per-region confidence, evidence split by channel (social/search/retail/runway) with counts, attribute breakdown, related trends, counter-signals, publication state, backtest, expert note. |
| `02-colecciones-portfolio.png` | Colecciones | Portfolio as collection cards: stage rail, next decision, owner, deadline, progress %, current blocker, plus a season timeline by drop and a **shared supplier bottleneck** panel across collections. |
| `03-direccion-v3.png` | Dirección | The direction document: editorial idea, references **with licence per image**, palette with declared %, key silhouettes as line sketches, material direction with MOQ/lead time/origin, "must include / must avoid" rules, price architecture by category, and a governance sidebar (completeness, unresolved facts, contradictions, version history, per-discipline approvals). |
| `04-inteligencia-marca.png` | Inteligencia · Para tu marca | The same trend judged FOR one brand: world evidence beside the brand's own archive, "why it fits" by axis, **"what not to copy"**, world forecast vs brand forecast with scenarios, evidence-completeness meters, and a recommendation with category mix, price band, test quantity and timing vs critical path. |
| `05-hoy.png` | Hoy | Decision inbox: one principal decision with its recommendation, cited evidence and **missing-data warning**, a queue of next decisions with owner and priority, critical path, today's approvals, supplier risk, week plan. |
| `06-estudio-conceptos.png` | Estudio | Concept generation: direction axes as chips, a **fidelity↔experimentation slider**, batch size with cost estimate, concept grid, selected concept with colourways and material detail, director's reading with novelty/alignment/viability scores, and a provenance block (references used, model version, prompt lineage, rights, "not production-ready"). |
| `07-plan-de-rango.png` | Plan de rango | The assortment board: category rows × drops, each slot a card with units/price/margin, a decision rail (contradictions, budget warnings, operational failures, pending approvals), and a per-slot detail with size curve. |
| `08-ficha-tecnica.png` | Desarrollo · Ficha técnica | Tech pack detail: stage rail (Concepto → Especificación → Proto → Calce → SMS → Liberado), construction decisions with per-decision status, flat sketches with **numbered callouts**, colourways × SKUs, BOM/measurements/fit/quotes status cards each with its verifier, supplier-readiness grouped **by person** with blocker counts, per-discipline approvals, version history, and a detail drawer per decision with an **"AI suggestions · not verified"** tab. |

---

## Verdicts, element by element

### Already REAL — only the surface is missing

* **Version history on the tech pack** (`08`). `tech_pack_drafts` versions and
  supersedes exist; the desk shows only the current one.
* **Per-discipline approvals** (`03`, `08`). `approvals.py` + `User.disciplines`
  are wired into Revisión and nowhere else.
* **Licence per reference** (`03`). `direction_references` cannot be stored
  without purpose + rights (CHECK constraints); `rights='unknown'` is
  first-class. The data is richer than most screens show.
* **Palette with declared %** (`03`). Direction stores it, and Dirección
  already renders proportional bands.
* **Evidence counts by channel** (`01`). The observatory stores source and
  date per item.
* **"AI suggestions · not verified"** (`08`) — the single best detail in the
  set, and exactly `ai_proposed` vs `human_verified`, which the engine already
  enforces at the router. It deserves to be a permanent tab label.
* **Cost estimate before a batch** (`06`). Shipped 2026-08-14 — the studio now
  states provider, model and per-image cost before the button.

### BLOCKED on a named engine capability

* **Stage rail Proto → Calce → SMS** (`08`) and **critical path** (`02`, `05`).
  `critical_path.project()` keys on milestone alone, so two Styles both at
  `proto_sample` overwrite each other. §13 prerequisite 1.
* **Blockers grouped by person** (`08`) — fields carry provenance but no
  assignee. Needs an owner per field, which is a schema decision.
* **Colourways × SKUs** (`08`) — `product_master` has the tables; nothing
  writes `slot.style_id` to reach them. §13 prerequisite 4.
* **Shared supplier bottlenecks** (`02`) — supplier performance is computed
  brand-wide and never joined to the supplier. §13 prerequisite 2, and a live
  defect on a shipped endpoint.
* **Numbered callouts on flats** (`08`) — needs the vector flat workspace. A
  render cannot carry construction callouts, and the engine refuses to treat
  one as a technical flat (`test_tech_pack.py:386`).
* **Forecast with an uncertainty cone** (`01`, `04`) — §8 is scaffolded, zero
  validated, blocked on the §0 gold set. Drawing the cone before the model is
  validated would be the most convincing lie in the product.
* **Brand-to-brand comparison / peer groups** (`04`) — only item-level
  similarity exists, and embeddings are not multimodal on this deployment.

### UNEARNED — real practice, and the computation behind it does not exist here

Every item below is legitimate and standard. None is a mockup invention. Each
names the work required before the screen may state it.

* **HERO / CORE / ENTRY tiers** (`07`). Standard range-planning structure — a
  hero style is expected to carry 30–40% of unit sales. We have no field for
  it; the board shows `carryover_type`, a different axis. **Cheapest real win
  in the set**: it is a planner-declared attribute, not an inference. Add the
  field, let the merchandiser set it, show it. No model required.
* **DROP 1 / 2 / 3** (`02`, `07`). Drops are how the industry ships. We have no
  drop object, only `delivery_date`, so the shipped board groups by real
  delivery month. A drop is a named group of deliveries — a small schema
  addition, and a genuine gap rather than a fiction.
* **"HUECO DETECTADO — falta: vestido de ocasión"** (`07`). Assortment gap
  analysis is a whole product category, and "whitespace" is defined in the
  trade almost exactly this way. It requires a category framework plus a
  comparison set (last season, the plan, or a peer group) — we have none of the
  three. Until then `lib/rangeBoard.js` is right to forbid the words by test:
  an empty cell states an absence and stops. **That test is a stopgap, not a
  principle** — retire it when the comparison set exists.
* **"52% global coverage" and per-region confidence** (`01`). Real platforms
  compute this from their own crawl. Ours would need a declared denominator —
  coverage *of what population*. Nothing defines that yet, so the number cannot
  be computed, let alone drawn.
* **Novelty / alignment / viability as 0–100 scores** (`06`). The one I would
  still argue hardest about, and even here the objection is not "scores are
  dishonest". Trend platforms score, and their scores are backed by models with
  known inputs. Ours would not be — and DECISIONS.md (2026-07-19) makes the
  designer's own rating the taste signal deliberately, because a machine score
  shown beside a human one quietly outranks it. If we ever ship a score it
  needs a stated input set and a validation record, not three tidy numbers.

## How to use this set

Take the **layout, density and hierarchy** — they are excellent, they are what
the product is missing, and the owner's read is correct: polished professional
platforms look like this and Atelier does not.

Then be exact about the gap, because it is two gaps and they have different
costs:

1. **Surface.** The engine is frequently *richer* than our screen — licence per
   reference, provenance per field, gates that carry reasons, version history.
   This is pure UI work and the fastest visible progress available.
2. **Capability.** The references show real functions we have not built. That
   is a backlog with a price, not a set of things to refuse.

The rule is **earn the certainty, then draw it** — not *refuse the certainty*.
Refusing was the wrong instruction and it was in the first version of this
file: it would have kept Atelier permanently below these references and called
that integrity. State an absence where a figure is not computed yet, and treat
every absence as an item of work, not a settled answer.
