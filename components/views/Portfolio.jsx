"use client";
// COLECCIONES — the screen before the screen.
//
// A director does not open one collection first. They look across all of them
// and pick the one in trouble. Until this existed, that meant opening each in
// turn, which is exactly how the one that needed attention got missed.
//
// Every row is the engine's own `command_centre.assemble` projected down, so
// this list and the collection screen cannot disagree. Nothing here is
// re-counted, re-sorted or re-judged locally — including the ORDER, which is
// the engine's answer to "which decision unblocks the most work".
//
// 2026-08-06 (reference 02). It was a list of blocked rows; it is now the
// portfolio as objects you recognise. Three things to keep in mind if you
// extend it:
//
//  1. THE COVER IS THE COLLECTION'S OWN DIRECTION OR IT IS NOTHING. A cover
//     built from the brand's palette is the collection describing itself. A
//     stock photograph, or a garment borrowed from the catalogue because it
//     looked right, would be this screen inventing a creative direction that
//     nobody approved — on the screen whose whole job is to say which
//     collection is in trouble.
//  2. Every rich element omits ITSELF when its data is missing. Complot's four
//     collections currently have no brief, no plan rows and no direction, and
//     the screen has to stay honest and still look composed in that state.
//  3. The stage spine renders the engine's SIX stages. The mockup draws seven
//     (it splits Conceptos out of Desarrollo); drawing a stage the engine does
//     not track would put a step on screen that nothing can ever complete.
//
// 2026-08-13 restyle: the `cx-` classes lived in the shared stylesheet; this
// screen now owns its whole presentation under a `pf-` namespace, styled in
// the component's own <style> block (the TeamBrief pattern). The routing test
// reaches the hero through the literal text "Abrir la colección" — keep it.
import { useCallback, useEffect, useMemo, useState } from "react";

import { useEngine, useBrandId } from "@/components/EngineProvider";
import Icon from "@/components/ui/Icon";
import { useChrome } from "@/components/ui/Chrome";
import { ACTION_VIEW, STAGE_LABEL, STATE_LABEL, getPortfolio } from "@/lib/commandCentre";
import { getDirection } from "@/lib/direction";
import { engineAssetUrl, getStudioCovers, getConceptCovers } from "@/lib/api";

const STAGE_ORDER = ["brief", "range", "develop", "review", "launch", "results"];

const FILTERS = [
  { key: "all", label: "Todas" },
  { key: "attention", label: "Necesitan decisión" },
  { key: "ok", label: "En orden" },
];

/* ---------------------------------------------------------------- spine -- */

function Spine({ stage }) {
  const at = STAGE_ORDER.indexOf(stage);
  return (
    <ol className="pf-spine">
      {STAGE_ORDER.map((s, i) => (
        <li key={s} className={i < at ? "done" : i === at ? "now" : ""}>
          <span className="pf-dot">{i < at ? <Icon name="check" /> : null}</span>
          <b>{STAGE_LABEL[s] || s}</b>
          <small>{i < at ? "hecho" : i === at ? "acá" : "pendiente"}</small>
        </li>
      ))}
    </ol>
  );
}

// The compact rows carry the same six-stage fact as a line of dots — the
// engine's stage, nothing recomputed. Decorative to a screen reader (the
// stage label right above it says the same thing in words).
function MiniSpine({ stage }) {
  const at = STAGE_ORDER.indexOf(stage);
  return (
    <span className="pf-mini" aria-hidden="true">
      {STAGE_ORDER.map((s, i) => (
        <i key={s} className={i < at ? "done" : i === at ? "now" : ""} />
      ))}
    </span>
  );
}

/* ---------------------------------------------------------------- cover -- */

// Three states, in order of how much the collection has actually said about
// itself: its own approved reference image, then its own approved palette, then
// an honest blank. Nothing here is borrowed from the catalogue or the market.
function Cover({ cover, palette, gallery, compact }) {
  if (cover?.url) {
    return (
      <div className={`pf-cover img${compact ? " sm" : ""}`}>
        <img src={cover.url} alt={cover.title || ""} loading="lazy" />
        {!compact && gallery?.length > 0 && (
          <div className="pf-cover-strip">
            {gallery.map((g, i) => (
              <img key={i} src={g.url} alt={g.title || ""} loading="lazy" title={g.title} />
            ))}
          </div>
        )}
        {!compact && !gallery?.length && palette?.length > 0 && (
          <div className="pf-cover-pal">
            {palette.slice(0, 4).map((c, i) => (
              <span key={i} style={{ background: c.hex }} title={c.name || c.hex} />
            ))}
          </div>
        )}
      </div>
    );
  }
  if (palette?.length) {
    return (
      <div className={`pf-cover pal${compact ? " sm" : ""}`}>
        {palette.slice(0, 4).map((c, i) => (
          <span key={i} style={{ background: c.hex }} title={c.name || c.hex} />
        ))}
      </div>
    );
  }
  return (
    <div className={`pf-cover empty${compact ? " sm" : ""}`}>
      {!compact && (
        <>
          <Icon name="spark" />
          <b>Sin dirección visual todavía</b>
          <span>Esta colección no tiene paleta ni referencias aprobadas.</span>
        </>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- hero -- */

function Hero({ row, art, onOpen, onAct }) {
  const c = row.counts || {};
  const facts = [
    c.slots ? { n: c.slots, label: c.slots === 1 ? "posición" : "posiciones" } : null,
    c.concepts ? { n: c.concepts, label: c.concepts === 1 ? "concepto" : "conceptos" } : null,
    c.concepts_approved ? { n: c.concepts_approved, label: "aprobados" } : null,
    row.blockers ? { n: row.blockers, label: row.blockers === 1 ? "bloqueo" : "bloqueos", tone: "bad" } : null,
    row.approvals_outstanding
      ? { n: row.approvals_outstanding, label: "aprobaciones", tone: "warn" } : null,
  ].filter(Boolean);

  return (
    <article className={`pf-hero ${row.state}`}>
      <Cover cover={art?.cover} palette={art?.palette} gallery={art?.gallery} />

      <div className="pf-hero-body">
        <p className="pf-season">{STAGE_LABEL[row.stage] || row.stage}</p>
        <button className="pf-name" onClick={() => onOpen(row)}>{row.name}</button>
        <p className="pf-intent">{row.intent}</p>
        {/* An explicit way in. The name alone was the only route to the
            collection's own screen, and a serif heading does not read as a
            link — so the overview was effectively unreachable by anyone who
            had not been told it was there. The literal text is also the
            routing test's fallback selector: keep it exactly. */}
        <button className="pf-open" onClick={() => onOpen(row)}>
          Abrir la colección <Icon name="arrow" />
        </button>

        {facts.length > 0 && (
          <div className="pf-facts">
            {facts.map((f, i) => (
              <span key={i} className={f.tone || ""}><b>{f.n}</b> {f.label}</span>
            ))}
          </div>
        )}
      </div>

      <aside className="pf-next">
        <span className="pf-eyebrow">Lo que sigue</span>
        <p>{row.next_decision}</p>
        {row.action && (
          <button className="pf-act" onClick={() => onAct(row)}>
            {row.action.label}
          </button>
        )}
        <div className="pf-next-state">
          <i className={row.state} />
          {STATE_LABEL[row.state] || row.state}
          {row.unanswered > 0 && (
            <span title="Preguntas que esta colección todavía no puede responder">
              · {row.unanswered} sin datos
            </span>
          )}
        </div>
      </aside>

      {/* Full card width, as its own row. Squeezed into the body column beside
          the action panel and the reading rail, six stage labels truncate to
          "Plan…/Des…/Revi…" — and a spine you cannot read is worse than none,
          because it still costs the space. */}
      <div className="pf-spine-row">
        <Spine stage={row.stage} />
      </div>
    </article>
  );
}

/* ---------------------------------------------------------------- styles -- */

const CSS = `
.pf { min-width: 0; }

.pf-eyebrow {
  display: block;
  font-family: var(--d); font-size: var(--fs-caption); font-weight: 600;
  letter-spacing: var(--track-caps); text-transform: uppercase;
  color: var(--editorial);
}
.pf-title {
  font-family: var(--serif); font-size: 42px; line-height: 1.06;
  letter-spacing: -.015em; font-weight: 500; color: var(--ink);
  margin: 10px 0 0; max-width: 22ch;
}
.pf-lede {
  margin: var(--s2) 0 0; font-size: var(--fs-body-lg); color: var(--ink-2);
  max-width: 64ch; line-height: var(--lh-body);
}

/* ------------------------------------------------------- header + filters */
.pf-head {
  display: flex; align-items: flex-end; justify-content: space-between;
  gap: var(--s5); flex-wrap: wrap;
}
.pf-filters { display: flex; gap: var(--s4); }
.pf-filters button {
  padding: 6px 1px 8px; font-size: var(--fs-body); font-weight: 500;
  color: var(--ink-2); border-bottom: 2px solid transparent;
  transition: color .15s ease;
}
.pf-filters button:hover { color: var(--ink); }
.pf-filters button.on {
  color: var(--ink); font-weight: 700; border-bottom-color: var(--ink);
}

/* ------------------------------------------------------------------ hero */
.pf-hero {
  margin-top: var(--s5);
  background: var(--card); border: 1px solid var(--line);
  border-radius: var(--r); box-shadow: var(--shadow);
  padding: var(--s5);
  display: grid;
  grid-template-areas: "cover body next" "spine spine spine";
  grid-template-columns: minmax(0, 30fr) minmax(0, 42fr) minmax(230px, 28fr);
  gap: var(--s5);
}
.pf-hero > .pf-cover { grid-area: cover; }
.pf-hero > .pf-hero-body { grid-area: body; }
.pf-hero > .pf-next { grid-area: next; }
.pf-hero > .pf-spine-row { grid-area: spine; }

/* ----------------------------------------------------------------- cover */
.pf-cover {
  position: relative; aspect-ratio: 4 / 3;
  border-radius: var(--r-sm); overflow: hidden;
  background: var(--paper-2); align-self: start;
}
.pf-cover.img img {
  position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
}
.pf-cover-strip {
  position: absolute; left: var(--s3); bottom: var(--s3);
  display: flex; gap: 6px;
}
.pf-cover-strip img {
  width: 44px; height: 44px; object-fit: cover;
  border-radius: var(--r-xs); box-shadow: 0 0 0 1.5px rgba(255,255,255,.85);
}
.pf-cover-pal {
  position: absolute; left: var(--s3); bottom: var(--s3);
  display: flex; gap: 5px;
}
.pf-cover-pal span {
  width: 26px; height: 26px; border-radius: 5px;
  box-shadow: 0 0 0 1.5px rgba(255,255,255,.85);
}
/* Palette-only cover: the approved colours as four vertical bands. */
.pf-cover.pal { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; }
.pf-cover.pal span { display: block; height: 100%; }
/* The honest blank. */
.pf-cover.empty {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; text-align: center; gap: 6px; padding: var(--s5);
}
.pf-cover.empty svg { width: 20px; height: 20px; color: var(--ink-3); }
.pf-cover.empty b { font-size: var(--fs-body); font-weight: 600; color: var(--ink-2); }
.pf-cover.empty span {
  font-size: 11.5px; color: var(--ink-3); line-height: var(--lh-body);
  max-width: 26ch;
}
/* Compact thumb for the rows. */
.pf-cover.sm {
  width: 72px; height: 72px; aspect-ratio: auto;
  border-radius: var(--r-xs); flex: none;
}

/* ------------------------------------------------------------- hero body */
.pf-hero-body {
  min-width: 0; display: flex; flex-direction: column; align-items: flex-start;
}
.pf-season {
  display: block; margin: 0;
  font-family: var(--d); font-size: var(--fs-caption); font-weight: 600;
  letter-spacing: var(--track-caps); text-transform: uppercase;
  color: var(--editorial);
}
.pf-name {
  display: block; padding: 0; margin: var(--s2) 0 0; text-align: left;
  font-family: var(--serif); font-size: 30px; line-height: 1.12;
  letter-spacing: -.01em; font-weight: 500; color: var(--ink);
  transition: color .15s ease;
}
.pf-name:hover { color: var(--oxblood-ink); }
.pf-intent {
  margin: var(--s2) 0 0; font-size: var(--fs-body-lg); color: var(--ink-2);
  line-height: var(--lh-body); max-width: 52ch;
}
.pf-open {
  display: inline-flex; align-items: center; gap: var(--s2);
  margin: var(--s4) 0 var(--s5);
  padding: 9px 18px; border: 1px solid var(--ink); border-radius: 99px;
  font-size: var(--fs-body); font-weight: 600; color: var(--ink);
  background: transparent;
  transition: background .15s ease, color .15s ease;
}
.pf-open:hover { background: var(--ink); color: #fff; }
.pf-open svg { width: 14px; height: 14px; flex: none; }
.pf-facts {
  display: flex; flex-wrap: wrap; row-gap: var(--s3);
  margin-top: auto; padding-top: var(--s4);
  border-top: 1px solid var(--hair); align-self: stretch;
}
.pf-facts span {
  display: flex; flex-direction: column; gap: 2px;
  padding: 0 var(--s4); border-left: 1px solid var(--hair);
  font-size: 11.5px; color: var(--ink-3);
}
.pf-facts span:first-child { padding-left: 0; border-left: 0; }
.pf-facts b {
  font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums;
  line-height: var(--lh-flat); color: var(--ink);
}
.pf-facts .bad b { color: var(--danger); }
.pf-facts .warn b { color: var(--warning); }

/* --------------------------------------------------- "Lo que sigue" aside */
.pf-next {
  display: flex; flex-direction: column; min-width: 0;
  background: var(--paper-2); border-radius: var(--r-sm);
  padding: var(--s4);
}
.pf-next .pf-eyebrow { margin-bottom: var(--s3); }
.pf-next p {
  margin: 0 0 var(--s4); font-size: 13.5px; line-height: var(--lh-body);
  color: var(--ink);
}
.pf-act {
  display: block; width: 100%; padding: 10px var(--s4);
  border-radius: 99px; background: var(--cobalt); color: #fff;
  font-size: var(--fs-body); font-weight: 600; text-align: center;
  transition: background .15s ease;
}
.pf-act:hover { background: var(--cobalt-ink); }
.pf-next-state {
  margin-top: auto; padding-top: var(--s4);
  display: flex; align-items: center; gap: 7px; flex-wrap: wrap;
  font-size: 11.5px; color: var(--ink-3);
}
.pf-next-state i {
  width: 7px; height: 7px; border-radius: 50%; flex: none;
  background: var(--hair-2);
}
.pf-next-state i.ok { background: var(--sage); }
.pf-next-state i.blocked { background: var(--danger); }
.pf-next-state i.at_risk { background: var(--warning); }

/* ----------------------------------------------------------------- spine */
.pf-spine-row { border-top: 1px solid var(--hair); padding-top: var(--s4); }
.pf-spine { list-style: none; margin: 0; padding: 0; display: flex; }
.pf-spine li { position: relative; flex: 1; min-width: 0; padding-right: var(--s2); }
.pf-spine li::after {
  content: ""; position: absolute; top: 4px; left: 16px; right: 4px;
  height: 2px; background: var(--hair-2);
}
.pf-spine li:last-child::after { display: none; }
.pf-spine li.done::after { background: var(--positive); }
.pf-dot {
  display: flex; align-items: center; justify-content: center;
  width: 10px; height: 10px; border-radius: 50%; background: var(--hair-2);
}
.pf-spine li.done .pf-dot { background: var(--positive); }
.pf-spine li.done .pf-dot svg { width: 7px; height: 7px; color: #fff; }
.pf-spine li.now .pf-dot { background: #fff; border: 2px solid var(--cobalt); }
.pf-spine b {
  display: block; margin-top: var(--s2);
  font-family: var(--d); font-size: var(--fs-caption); font-weight: 600;
  letter-spacing: var(--track-caps); text-transform: uppercase;
  color: var(--ink-3);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pf-spine li.done b, .pf-spine li.now b { color: var(--ink); }
.pf-spine small { display: block; margin-top: 2px; font-size: 11px; color: var(--ink-3); }

/* ------------------------------------------------------------------ rows */
.pf-rows { display: flex; flex-direction: column; gap: var(--s3); margin-top: var(--s4); }
.pf-row {
  display: grid;
  grid-template-areas: "cover main next pill arrow";
  grid-template-columns: 72px minmax(0, 11fr) minmax(0, 13fr) auto auto;
  align-items: center; column-gap: var(--s4);
  width: 100%; text-align: left;
  background: var(--card); border: 1px solid var(--line);
  border-radius: var(--r); padding: var(--s3) var(--s4);
  transition: border-color .15s ease, box-shadow .15s ease;
}
.pf-row:hover { border-color: var(--hair-2); box-shadow: var(--shadow); }
.pf-row > .pf-cover.sm { grid-area: cover; }
.pf-row-main { grid-area: main; min-width: 0; }
.pf-row-main b {
  display: block; margin-top: 3px;
  font-family: var(--disp); font-weight: 700; font-size: 15px;
  line-height: 1.25; color: var(--ink);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.pf-mini { display: inline-flex; gap: 4px; margin-top: 7px; }
.pf-mini i {
  width: 5px; height: 5px; border-radius: 50%; background: var(--hair-2);
}
.pf-mini i.done { background: var(--positive); }
.pf-mini i.now { background: var(--ink); }
.pf-row-next {
  grid-area: next; min-width: 0;
  font-size: 12.5px; color: var(--ink-3); line-height: 1.45;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
}
.pf-pill {
  grid-area: pill; white-space: nowrap;
  font-family: var(--d); font-size: var(--fs-caption); font-weight: 600;
  letter-spacing: var(--track-caps); text-transform: uppercase;
  padding: 5px 10px; border-radius: 99px;
  background: var(--paper-2); color: var(--ink-2);
}
.pf-pill.blocked { background: var(--clay-wash); color: var(--danger); }
.pf-pill.at_risk { background: var(--ochre-wash); color: var(--warning); }
.pf-row > svg { grid-area: arrow; width: 16px; height: 16px; color: var(--ink-3); }
.pf-row:hover > svg { color: var(--ink); }

/* ------------------------------------------------------------ responsive */
@media (max-width: 1180px) {
  .pf-hero {
    grid-template-areas: "cover body" "next next" "spine spine";
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
}
@media (max-width: 760px) {
  .pf-title { font-size: 32px; }
  .pf-name { font-size: 26px; }
  .pf-hero {
    padding: var(--s4);
    grid-template-areas: "cover" "body" "next" "spine";
    grid-template-columns: minmax(0, 1fr);
    gap: var(--s4);
  }
  .pf-spine-row { overflow-x: auto; }
  .pf-spine { min-width: 520px; padding-bottom: var(--s1); }
  .pf-row {
    grid-template-areas: "cover main arrow" "next next pill";
    grid-template-columns: 72px minmax(0, 1fr) auto;
    row-gap: var(--s2);
  }
  .pf-pill { justify-self: end; }
}
`;

/* ---------------------------------------------------------------- screen -- */

export default function Portfolio({ onNavigate }) {
  const engine = useEngine();
  const brandId = useBrandId();
  const [data, setData] = useState(null);
  const [palettes, setPalettes] = useState({});
  const [filter, setFilter] = useState("all");
  const [state, setState] = useState({ loading: true, error: null });

  const load = useCallback(async () => {
    if (!brandId) { setState({ loading: false, error: null }); return; }
    setState({ loading: true, error: null });
    try {
      setData(await getPortfolio(brandId));
      setState({ loading: false, error: null });
    } catch (e) {
      setState({ loading: false, error: String(e.message || e) });
    }
  }, [brandId]);

  useEffect(() => { load(); }, [load]);

  // Covers are a SECOND, optional read. The portfolio renders fully without
  // them; a collection whose direction cannot be read just shows no palette
  // rather than blocking the list that tells you what is on fire.
  useEffect(() => {
    if (!brandId || !data?.items?.length) return;
    let live = true;
    (async () => {
      // Two sources, one read each, both the collection's OWN work:
      //   · its concept renders  — what it has actually drawn
      //   · its direction        — what it has approved to look like
      const studio = await getStudioCovers(brandId);
      const pairs = await Promise.all(data.items.slice(0, 8).map(async (row) => {
        const [dir, covers] = await Promise.all([
          getDirection(brandId, row.collection_id).catch(() => null),
          getConceptCovers(brandId, row.collection_id, 4),
        ]);
        const palette = (dir?.items?.colours || [])
          .filter((c) => c.hex_value)
          .map((c) => ({ hex: c.hex_value, name: c.name }));
        // Only a reference the engine actually STORED. A row that merely names
        // an external URL is a citation, not an asset we can render.
        const ref = (dir?.items?.references || []).find((r) => r.stored && r.image_url);
        // Approved concept renders first — the garments this collection has
        // actually signed off. Then the studio board's own covers, then the
        // mood reference that inspired it, which is the weakest claim of the
        // three about what the collection IS.
        const renders = [
          ...(covers?.covers || []).map((c) => ({ url: c.image_data_uri, title: c.name })),
          ...(studio[row.collection_id] || []),
        ];
        return [row.collection_id, {
          palette,
          cover: renders[0]
            || (ref ? { url: engineAssetUrl(ref.image_url), title: ref.title } : null),
          gallery: renders.slice(1, 4),
        }];
      }));
      if (live) setPalettes(Object.fromEntries(pairs));
    })();
    return () => { live = false; };
  }, [brandId, data]);

  // ⚠ ONE WRITER, AND IT IS THE URL. These used to call `setActive` first and
  // navigate second, which is how clicking "Abrir la colección" on one row
  // opened a different collection: `setActive` only schedules, so the
  // navigation wrote the PREVIOUS id into `?collection=` and the provider read
  // that back as the authority.
  //
  // The `setActive` call is gone rather than merely reordered. `navigate`
  // writes the whole hash — view and collection — in one assignment. Leaving a
  // second write here is what let this same defect reappear in Studio.
  function open(row, view) {
    onNavigate(view || "command", { collectionId: row.collection_id });
  }
  function act(row) {
    onNavigate(ACTION_VIEW[row.action?.do] || "command",
               { collectionId: row.collection_id });
  }

  const items = useMemo(() => {
    const all = data?.items || [];
    if (filter === "attention") return all.filter((r) => r.state !== "ok");
    if (filter === "ok") return all.filter((r) => r.state === "ok");
    return all;
  }, [data, filter]);

  const lead = items[0] || null;
  const rest = items.slice(1);


  useChrome({
    read: data
      ? {
          interpretation:
            "El orden lo decide el motor: arriba va la colección cuya próxima decisión desbloquea más trabajo, no la más reciente ni la primera alfabéticamente.",
          signals: [
            { icon: "grid", label: "Colecciones", text: String(data.count) },
            { icon: "warn", label: "Necesitan una decisión", text: String(data.needs_attention) },
          ],
          unknowns: (data.items || []).some((r) => r.unanswered > 0)
            ? ["Hay colecciones con preguntas que todavía no se pueden responder — la etiqueta «sin datos» dice cuántas por fila."]
            : [],
          trace: [
            { icon: "doc", label: "Origen", text: "command_centre.assemble, la misma lectura que la pantalla de colección" },
            ...(engine.mode ? [{ icon: "globe", label: "Corrida", text: engine.mode }] : []),
          ],
        }
      : null,
    decision: lead?.action
      ? {
          title: "Decisión humana",
          note: `Abre «${lead.name}» en la pantalla donde se resuelve. Nada se guarda hasta que decidas ahí.`,
          actions: [{ label: lead.action.label, primary: true, onClick: () => act(lead) }],
        }
      : null,
  }, [data, lead?.collection_id, engine.mode]);

  /* ------------------------------------------------------------- render -- */

  if (!brandId) {
    return (
      <section className="pf">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <h1 className="pf-title">Las colecciones viven en el motor</h1>
        <p className="pf-lede">Sin conexión no hay cartera que mostrar.</p>
      </section>
    );
  }
  if (state.loading) {
    return (
      <section className="pf">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="ax-sk line w45" /><div className="ax-sk title" />
        <div className="ax-sk block" /><div className="ax-sk line w90" />
      </section>
    );
  }
  if (state.error) {
    return (
      <section className="pf">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <h1 className="pf-title">No se pudieron leer las colecciones</h1>
        <p className="pf-lede">{state.error}</p>
      </section>
    );
  }
  if (!data?.count) {
    return (
      <section className="pf">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <span className="pf-eyebrow">Portfolio de colecciones</span>
        <h1 className="pf-title">Todavía no hay colecciones</h1>
        <p className="pf-lede">Creá una para empezar el recorrido de brief a resultado.</p>
      </section>
    );
  }

  return (
    <section className="pf">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <span className="pf-eyebrow">Portfolio de colecciones</span>

      <div className="pf-head">
        <div>
          <h1 className="pf-title">
            {data.needs_attention > 0
              ? `${data.needs_attention} de ${data.count} ${data.needs_attention === 1 ? "necesita" : "necesitan"} una decisión`
              : `${data.count} ${data.count === 1 ? "colección" : "colecciones"}, ninguna bloqueada`}
          </h1>
          <p className="pf-lede">
            Ordenadas por la decisión que más trabajo desbloquea, no alfabéticamente.
          </p>
        </div>
        <div className="pf-filters" role="tablist">
          {FILTERS.map((f) => (
            <button key={f.key} role="tab" aria-selected={filter === f.key}
                    className={filter === f.key ? "on" : ""}
                    onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 && (
        <p className="pf-lede" style={{ marginTop: 22 }}>
          Ninguna colección cae en este filtro.
        </p>
      )}

      {lead && (
        <Hero row={lead} art={palettes[lead.collection_id]} onOpen={open} onAct={act} />
      )}


      {rest.length > 0 && (
        <div className="pf-rows">
          {rest.map((row) => (
            <button key={row.collection_id} className={`pf-row ${row.state}`} onClick={() => open(row)}>
              <Cover cover={palettes[row.collection_id]?.cover} palette={palettes[row.collection_id]?.palette} compact />
              <span className="pf-row-main">
                <span className="pf-season">{STAGE_LABEL[row.stage] || row.stage}</span>
                <b>{row.name}</b>
                <MiniSpine stage={row.stage} />
              </span>
              <span className="pf-row-next">{row.next_decision}</span>
              <span className={`pf-pill ${row.state}`}>{STATE_LABEL[row.state] || row.state}</span>
              <Icon name="arrow" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
