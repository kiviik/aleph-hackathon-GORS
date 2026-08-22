# Authored, not generated — five screens, 2026-08-17

The third reference set (`../atelier-redesign/` 08-13, `../atelier-plm-2026-08-14/`
08-14). This one differs from both: **it is not a set of images, it is running
HTML** — `screens.html`, self-contained, no build step, open it in a browser.

It exists because the owner supplied a Dreamland generation mockup and said the
earlier concepts *"made Atelier feel too AI-led. Designers need far more
authorship."* The mockup answered that for generation. These five screens carry
the same answer into the places the product had not yet asked the question.

**The mockup is the design system here, not a starting point to improve on.**
Everything below extends it; nothing overrides it.

## The one sentence the whole set is built on

> Atelier can suggest, explain and accelerate — but it never silently makes the
> designer's decisions.

## What it contains

| # | Screen | The authorship problem it answers |
|---|---|---|
| 01 | **Intelligence** | The designer chooses markets, horizon, competitors, evidence sources and assumptions. Turning a source off REMOVES it and drops coverage — it never reweights the remainder to look more certain. No combined score; contradicting evidence stays on screen; the reading carries an expiry date |
| 02 | **Develop this** | The moment exploration becomes commitment, as a screen rather than a side effect. States what stays exploratory (143 images, with seeds and parentage), what becomes permanent, and refuses to promote a render into a tech pack |
| 03 | **Tech pack** | Every BOM row, POM, tolerance and callout editable, each tagged `imported · verified · proposed · missing`. A blank measurement stays blank. Required lanes are the ones the BRAND turned on |
| 04 | **Suppliers & quotes** | Quotes across seasons including the expired one; the cheapest named as a fact while the award goes where the buyer says, with their reason; capability shows `unknown` as unknown; an acknowledgement is marked a relayed claim |
| 05 | **Reference library** | References as a first-class object: what they teach, their rights, and lineage running both ways — this swatch produced 23 generations, two became Styles |

## The design system, as tokens

Taken from the owner's mockup and named so code can use them:

| role | value | why |
|---|---|---|
| `--ink` | `#121110` | warm near-black; the rail and body text |
| `--paper` | `#F4F0E8` | the cream ground the mockup establishes |
| `--card` | `#FFFDF9` | panels, one step above the ground |
| `--hair` | `#E2DCCF` | every separation is a hairline, never a shadow |
| `--ox` | `#6E1E28` | oxblood. **One committing action per screen** — never decoration |
| `--sand` `--clay` | `#C9B9A0` `#B98159` | drawn from the garment world the product serves |
| `--ok` `--caution` `--refuse` | `#4A7A55` `#A8762A` `#9B2C2C` | semantic only: rights, verification, refusal. Never an accent |

Type: a transitional serif (`Iowan Old Style` / Palatino / Georgia) for the
wordmark and screen titles; the system grotesque for controls; monospace with
`tabular-nums` for anything a designer compares down a column. **No webfont
URLs** — the artifact CSP blocks font CDNs and a silent fallback would wreck the
identity, so the stack is native on purpose.

Dark theme is designed, not inverted: cream ink on near-black, oxblood
brightened to `#C4606B` so it still carries as the committing colour.

## Devices worth stealing into the real screens

1. **The commitment footer.** The mockup's *"You will generate: 4 variations ·
   Front view · Midi length…"* is the strongest authorship device in the whole
   design, and every screen here has its own: *"Cannot release yet: 1
   measurement missing · 2 proposals unverified"*, *"You are committing: 1
   concept version · 1 Style · 143 images stay in Dreamland"*. A bar that states
   exactly what is about to happen, in the user's words, before it happens.
2. **Provenance as a chip per field**, not a document-level badge. `proposed`
   is dashed and amber; `verified` is solid and green; `missing` is red and says
   missing. The rule this product already enforces server-side, finally visible.
3. **Locks that survive a regeneration**, carried from the mockup into every
   screen with inputs — the Intelligence panel locks markets the same way the
   garment anatomy locks a neckline.
4. **"Reset to my input"** on every screen that has inputs, not just generation.

## What is REAL, PROPOSED, and UNEARNED

The same three-way split `../atelier-plm-2026-08-14/README.md` uses, because it
is the only thing that stops a mockup being read as a promise.

**REAL — the engine serves this today.** Per-field provenance and the release
gate (`tech_pack.py`, migration 0058–0070) · one released pack per Style (0075)
· quote comparison across seasons with the expired one kept and the award
seasonal (`suppliers.py`, 2026-08-16) · supplier on-time from attributed
milestones with unattributed ones excluded AND counted (0071) · delivery events
with the acknowledgement marked a relayed claim (0079) · reference `purpose` and
`rights`, with `GENERATION_SAFE_RIGHTS` already refusing public/unknown-rights
references in a client-facing render (`collection_gates.py`) · asset lineage via
`parent_asset_id`, and asset → concept version via `POST …/assets/{id}/attach`.

**PROPOSED — designed here, not built.** The Intelligence screen as a whole
(the engine has gates and evidence, not this reading) · scenarios A/B/C ·
the reading's expiry date · the Develop-this gate · reference worlds outside a
direction version · saved discoveries.

**UNEARNED — do not draw it as if it worked.** Demand trajectory. The screen
shows it as *not enough evidence* on purpose, and ROADMAP §0 gates it on a gold
set that does not exist. Any version of this design that renders a confident
trend line is lying, however good it looks.

## Where this lands in the plan

ROADMAP **§19** (Dreamland · Intelligence · Reality) records the vision and the
map of what already exists. This set is its visual half. The acceptance that
governs screen 02 is **A19.1** — a generation carries its intent, and an
exploratory run makes no commercial claim anywhere in the product.

~~The engine cannot tell exploration from commitment today.~~ **IT CAN, SINCE
migration 0080 (2026-08-17).** `generated_assets.intent` is `exploratory` by
default, promotion is an act with a person and a time, and attaching an asset to
a concept version promotes it — so screen 02's central sentence, *143 images stay
exploratory*, is now a fact the API will confirm (`GET /assets` returns
`intents: {exploratory, production_directed, unstated}`). The designer's words
are stored apart from the engine's added context, which is what makes *"Reset to
my input"* honest.

⚠ **There is still no `seed`, and the mockup shows one.** `imaging.generate_image`
cannot send a seed to any provider adapter in this repo, and a column holding a
number the provider never saw would promise reproducibility the product cannot
keep. The seed field on that mockup is UNEARNED until an adapter accepts one.

## Language

These screens are in English, following the owner's mockup. **The live product
is Spanish** (`Ficha técnica`, `sin definir`, `no calculable`) and ROADMAP F12
already tracks English strings leaking into Spanish screens as a defect. The
mockup's language is a design-exploration convention; treat the Spanish product
copy as authoritative when these become real screens.


---

## Second file: `professional-depth.html` (2026-08-17, later)

The owner supplied three more mockups — a collection retrospective, a product
construction tab with technical flats, and an inspiration library — and asked
for the platform to read *"more professional, more like Zhiyi, Centric"*. Two
follow-on screens complete the working sequence: the **Style record** that joins
visual intent to the technical pack, and the **honest pilot state** that appears
before any evidence exists. This file now answers all five at that density.
**Research first, then drawing**, and both findings changed the screens:

| Benchmark | What it actually does | What Atelier takes |
|---|---|---|
| **Zhiyi** ([zhiyitech.cn](https://www.zhiyitech.cn/home)) | A structured apparel database — ~1B garment images, ~1,000 attribute tags, garment detection → feature extraction → retrieval, best-seller prediction across 50 platforms, 8,000 brands | **Facets and find-similar are the interface**, not a search box. The library screen leads with attribute facets and per-attribute commercial read |
| **Centric** ([centricsoftware.com](https://www.centricsoftware.com/fashion-apparel/)) | Visual Boards put commercial data *under the image*; 3D is **Connect** — CLO, Browzwear and Optitex author, Centric records | Plan/sold/sell-through/margin sit under every look in the line-up. And **integrate, never author**: Atelier must not pretend to do 3D |

⚠ **What both were refused for:** a single confidence score. The retrospective
separates `Observed` from `Inferred`, keeps **counter-evidence on screen beside
the evidence**, and gates the proposed learning behind *"human review required
before this enters brand memory"*. That is the one thing neither benchmark does
and the whole reason this product is worth building.

**Drawn without a single external image**, because the artifact CSP blocks them
and because it forced a better answer: garments are inline SVG figures tinted
from the palette, the technical flats are real paths with numbered callouts and
enlarged details, and the plan-vs-actual small multiples are hand-built SVG
(dashed plan, solid actual, emphasised endpoint). Nothing is a screenshot, so
nothing rots.

### The two follow-on screens

| # | Screen | The professional problem it answers |
|---|---|---|
| 04 | **Style record** | One calm product workspace ties the approved concept, editable Style facts, per-field provenance, construction/BOM/measurement coverage, version history and the exact release blockers together. It explicitly labels the current governance gap: review signatures are recorded but do not gate release today |
| 05 | **No evidence yet** | A pilot is useful before integrations arrive. It distinguishes `asked · none returned`, `not run`, and `not connected`; preserves manual briefs, references and Style creation; and refuses forecasts, rankings, costs and fake zeroes |

The fifth screen is intentionally not a generic empty-state illustration. Each
absence says **what is known about the request**, **what cannot follow from it**,
and **the next action that creates real evidence**. This is the first screen of
a trustworthy pilot, not an edge case.

### Still UNEARNED in this file

The retrospective renders `Forecast accuracy` as a TAB and a footer chip that
says **no demand forecast — one season of history**. That is deliberate: §0
gates forecasting on a gold set that does not exist, and a filled-in accuracy
tab would be the most convincing lie in the product.

The Style record also refuses one attractive fiction: discipline signatures
are visible as a review record, but the screen says plainly that the current
release contract does not enforce them. The release refusal is driven only by
facts the engine can defend today — missing required fields, blank required
measurements and unverified proposals.
