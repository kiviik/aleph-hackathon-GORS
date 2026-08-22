"use client";
import { useEffect, useState } from "react";
import {
  GLOBAL_NAV, TITLES, VIEW_DATA_STATUS, DEFAULT_VIEW, resolveView, sectionForView,
  withCollection,
} from "@/lib/nav";
import { BRAND, BRAND_SEGMENTS } from "@/lib/config";
import { EngineProvider, useEngine } from "./EngineProvider";
import { CollectionProvider, useCollection } from "./CollectionProvider";
import { IdentityProvider, useIdentity } from "./IdentityProvider";
import AskBox from "./AskBox";
import Chain from "./Chain";
import QuickGenerate from "./QuickGenerate";
import SignIn from "./SignIn";
import Sidebar from "./Sidebar";
import CollectionHeader from "./CollectionHeader";
import Dashboard from "./views/Dashboard";
import Today from "./views/Today";
import Feed from "./views/Feed";
import Inspiration from "./views/Inspiration";
import DesignStudio from "./views/DesignStudio";
import Canvas from "./views/Canvas";
import Materials from "./views/Materials";
import TechPack from "./views/TechPack";
import StyleRecord from "./views/StyleRecord";
import StageRail from "./StageRail";
import CollectionBrief from "./views/CollectionBrief";
import Direction from "./views/Direction";
import CommandCentre from "./views/CommandCentre";
import Portfolio from "./views/Portfolio";
import Walkthrough from "./views/Walkthrough";
import EngineDown from "./EngineDown";
import { isPresenting } from "@/lib/presentation";
import Launch from "./views/Launch";
import LaunchResults from "./views/LaunchResults";
import LinePlan from "./views/LinePlan";
import Review from "./views/Review";
import Collections from "./views/Collections";
import World from "./views/World";
import Observatory from "./views/Observatory";
import Library from "./views/Library";
import Signals from "./views/Signals";
import Competitors from "./views/Competitors";
import Contradictions from "./views/Contradictions";
import CriticalPath from "./views/CriticalPath";
import Opportunities from "./views/Opportunities";
import Catalog from "./views/Catalog";
import Pipeline from "./views/Pipeline";
import Decisions from "./views/Decisions";
import BrandDNA from "./views/BrandDNA";
import Integrations from "./views/Integrations";
import Calibration from "./views/Calibration";
import VisualSearch from "./views/VisualSearch";
import Suppliers from "./views/Suppliers";
import Placeholder from "./views/Placeholder";
import Icon from "./ui/Icon";
import AtelierRead from "./ui/AtelierRead";
import DecisionBar from "./ui/DecisionBar";
import { ChromeProvider, useChromeSlots } from "./ui/Chrome";

// What the chrome says on the one screen that is not about a brand. A constant
// rather than two inline strings, because the header and the popover saying
// different things is the exact failure this replaces.
const WORLD_CHROME = {
  label: "Capa mundial · compartida",
  note: "Esta pantalla no es de ninguna marca: la consulta no lleva brand_id, y "
      + "dos marcas que preguntan lo mismo reciben el mismo id de pronóstico. "
      + "Su frescura es la del ciclo mundial, no la de la corrida de esta marca.",
};

export default function Shell() {
  return (
    <EngineProvider>
      <IdentityProvider>
        <CollectionProvider>
          <ChromeProvider>
            <ShellInner />
          </ChromeProvider>
        </CollectionProvider>
      </IdentityProvider>
    </EngineProvider>
  );
}

function timeAgo(iso) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso + (iso.endsWith("Z") ? "" : "Z")).getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h`;
  return `${Math.round(mins / (60 * 24))} d`;
}

// Hash carries view + tab: "#/market:signals". Old ids ("#/feed") resolve
// through the alias map in lib/nav.js, so every deep link and every
// onNavigate("feed")-style call across the app keeps landing correctly.
const routeFromHash = () => {
  const h = (typeof window !== "undefined" ? window.location.hash : "").replace(/^#\/?/, "");
  return resolveView(h || DEFAULT_VIEW);
};

// Stages and collection-scoped tools that all work on ONE collection. The
// results stage belongs to the global Results workspace in the sidebar, but it
// still needs the same collection selector and shareable collection URL.
const COLLECTION_LINKED_VIEWS = new Set([
  "command", "recorrido", "dashboard", "collectionbrief", "direction",
  "whitespace", "feed", "inspiration",
  "studio", "canvas", "materials", "lineplan", "boards", "techpack", "chain", "style", "review", "launch",
  "launchresults", "collections", "contradictions",
  // The engine's calendar routes are `/brands/{b}/collections/{c}/…` — there is
  // no brand-wide critical path, so this view is meaningless without the
  // selector and the shareable `?collection=` URL.
  "criticalpath",
]);

// ⚠ THE SWITCHER HAS TO MOVE THE URL TOO. Picking a collection here used to
// call `setActive` and nothing else, which left the previous collection sitting
// in `?collection=` — so the state and the URL disagreed until the next
// navigation, and a RELOAD resolved that disagreement in favour of the URL and
// silently put you back on the collection you had just left.
//
// It now calls `selectCollection`, the one operation that writes the canonical
// URL; the selection derives from there. The first fix here wrote BOTH, which
// worked and still left two writers — the reason Studio could reintroduce the
// same bug a day later.
function CollectionSwitch({ view }) {
  const { collections, activeId, selectCollection, loading } = useCollection();
  // The separator belongs to the switcher, not to the bar: rendered
  // independently it left a hairline floating beside nothing on every screen
  // that is not collection-scoped.
  if (!COLLECTION_LINKED_VIEWS.has(view) || loading) return null;
  if (!collections.length) {
    return (
      <>
        <span className="ax-sep" />
        <span className="ax-coll" style={{ color: "var(--ink-3)", fontSize: 14 }}>sin colección</span>
      </>
    );
  }
  return (
    <>
      <span className="ax-sep" />
      <span className="ax-switch">
        <span className="ax-switch-label">Colección activa</span>
        <label className="ax-coll" title="Todas las etapas trabajan sobre esta colección">
          <select value={activeId || ""}
                  onChange={(e) => selectCollection(e.target.value)}>
            {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Icon name="chevron" />
        </label>
      </span>
    </>
  );
}

function ShellInner() {
  const [route, setRoute] = useState({ view: DEFAULT_VIEW, tab: null });
  const [navOpen, setNavOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  // Filled by whichever screen is mounted; null means the screen declared
  // nothing, and the slot is not rendered at all.
  const { read, decision } = useChromeSlots();
  // Read on the client only: reading localStorage during render would make the
  // server and the first client paint disagree.
  const [presenting, setPresenting] = useState(false);
  const engine = useEngine();
  const { activeId: activeCollectionId } = useCollection();
  // `live` = a completed engine RUN exists (market surfaces have data).
  // `connected` = the engine answers and a brand is resolved (the whole
  // collection graph is readable). They are different facts and conflating
  // them made a brand without a run look like an empty product.
  const live = engine.status === "live";
  const connected = Boolean(engine.connected);
  const brandName = engine.brandName || BRAND;
  const { view, tab } = route;
  const dataStatus = VIEW_DATA_STATUS[view] || "sample";
  const section = sectionForView(view);
  const sectionLabel = GLOBAL_NAV.find((item) => item.key === section)?.label || "Hoy";

  useEffect(() => { setPresenting(isPresenting()); }, []);

  // ⚠ SCROLL BACK TO THE TOP ON A ROUTE CHANGE (owner walkthrough 2026-08-12).
  // A hash route does not reset scroll, so arriving at Studio from halfway down
  // another screen landed at `scrollY: 592` — a ~600px blank band above the
  // shell that reads as a completely broken layout. It survived a reload,
  // because the browser restores scroll position too. Nothing was broken; the
  // screen was simply below the fold, which is indistinguishable from broken
  // for the person looking at it.
  //
  // ⚠ AND THE scrollTo ALONE DOES NOT CLOSE IT. On a RELOAD the browser
  // restores its remembered offset AFTER React has mounted and run this
  // effect, so the band comes back — which is the case the comment above
  // already describes ("it survived a reload") and the effect cannot win.
  // Restoration has to be turned off explicitly, once.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo(0, 0);
  }, [view, tab]);

  // Route lives in the URL hash: refresh keeps your place, tabs deep-link.
  useEffect(() => {
    const sync = () => setRoute(routeFromHash());
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  // ⚠ THE COLLECTION MUST BE PASSED, NOT READ (owner review, 2026-08-13).
  //
  // Portfolio's "Abrir la colección" called `setActive(row.collection_id)` and
  // then `onNavigate(view)` in the same tick. `setActive` only SCHEDULES a state
  // update, so `activeCollectionId` in this closure was still the PREVIOUS
  // collection — this function wrote `?collection=<previous>` into the hash, the
  // `hashchange` listener in CollectionProvider read that back as the authority,
  // and it overwrote the correct pending selection. Clicking "open" on
  // Colección 4 landed you in Colección nueva.
  //
  // The URL is deliberately the authority for which collection is active (that
  // is what makes a collection linkable), so it cannot be allowed to carry a
  // value one render behind the click that caused it. A caller that is changing
  // the collection AND the view passes the id here, and both are written in the
  // same tick from the same value.
  //
  // This is worse than a wrong screen: every stage — Rango, Studio, Revisión —
  // works on "the active collection", so a designer could edit one collection
  // believing it was another, and nothing on the page would contradict them.
  function navigate(next, opts = {}) {
    const r = resolveView(next);
    // `undefined` means "whatever is active"; an explicit null means "none".
    const collectionId = opts.collectionId !== undefined
      ? opts.collectionId
      : activeCollectionId;
    const path = r.view + (r.tab ? ":" + r.tab : "");
    // One composer for the collection segment, shared with `selectCollection`,
    // so the two writers of this hash cannot format it differently.
    window.location.hash = withCollection(
      `#/${path}`,
      COLLECTION_LINKED_VIEWS.has(r.view) ? collectionId : null);
    setRoute(r);
    setNavOpen(false);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }

  function renderView() {
    switch (view) {
      case "today":
        return <Today onNavigate={navigate} />;
      case "dashboard":
        return <Dashboard onNavigate={navigate} />;
      case "feed":
        return <Feed onNavigate={navigate} />;
      case "inspiration":
        return <Inspiration onNavigate={navigate} />;
      case "studio":
        return <DesignStudio onNavigate={navigate} initialItemId={tab} />;
      // The canvas takes no props: it reads the brand and the collection from
      // the same providers every other collection-linked view does, and its
      // board is stored per brand rather than passed in.
      case "canvas":
        return <Canvas />;
      case "materials":
        return <Materials onNavigate={navigate} />;
      case "portfolio":
        return <Portfolio onNavigate={navigate} />;
      case "recorrido":
        return <Walkthrough onNavigate={navigate} />;
      case "command":
        return <CommandCentre onNavigate={navigate} />;
      case "collectionbrief":
        return <CollectionBrief onNavigate={navigate} />;
      case "direction":
        return <Direction onNavigate={navigate} />;
      case "launch":
        return <Launch onNavigate={navigate} />;
      case "launchresults":
        return <LaunchResults />;
      case "lineplan":
        return <LinePlan onNavigate={navigate} />;
      case "review":
        return <Review onNavigate={navigate} />;
      case "contradictions":
        return <Contradictions onNavigate={navigate} />;
      case "criticalpath":
        return <CriticalPath />;
      case "collections":
        return <Collections onNavigate={navigate} />;
      case "world":
        return <World />;
      case "observatory":
        return <Observatory onNavigate={navigate} />;
      case "library":
        return <Library onNavigate={navigate} />;
      case "trends":
        return <Signals onNavigate={navigate} />;
      case "competitors":
        return <Competitors onNavigate={navigate} />;
      case "whitespace":
        return <Opportunities onNavigate={navigate} />;
      case "catalog":
        return <Catalog onNavigate={navigate} />;
      case "boards":
        return <Pipeline onNavigate={navigate} />;
      // `tab` is the pack id: #/techpack:<pack_id>. The PACK is the authority
      // for THIS screen and stays so.
      //
      // ⚠ This note used to continue "no endpoint writes slot.style_id, so
      // routing through a Style would be routing through a relationship that
      // does not exist." That stopped being true on 2026-08-16: 0074's
      // `materialize` writes `slot.style_id`, and `tech_pack_drafts.style_id`
      // is written at build and carried through revision. The Style thread is
      // real now, and `#/style` below is what it unlocked.
      // ⚠ THE FOUR OBJECTS, TOGETHER. Every stage of §24's chain already
      // existed and none of them was ever shown beside the others, so the
      // product read as four tools sharing a database.
      case "chain":
        return <Chain />;
      case "techpack":
        return <TechPack packId={tab || null} onNavigate={navigate} />;
      // `tab` is the style id: #/style:<style_id>; empty opens the picker.
      case "style":
        return <StyleRecord styleId={tab || null} onNavigate={navigate} />;
      case "decisions":
        return <Decisions onNavigate={navigate} />;
      case "brand":
        return <BrandDNA />;
      case "integrations":
        return <Integrations />;
      case "calibration":
        return <Calibration />;
      case "products":
        return <VisualSearch onNavigate={navigate} />;
      // Brand-level, not collection-linked: a factory outlives any one
      // collection, exactly like a fabric in Materiales.
      case "suppliers":
        return <Suppliers onNavigate={navigate} />;
      default:
        return <Placeholder view={view} />;
    }
  }

  // A COMPLETED RUN IS NOT THE SAME AS A SCANNED MARKET, and this badge is on
  // every screen, so it was the widest-reaching overclaim in the product.
  // `status === "live"` only ever meant "a run payload exists and loaded" — it
  // never looked at HOW the run was produced. `run_from_fixtures` ("fully
  // offline run for the demo / tests", pipeline.py) replays saved signals, and
  // every run in the system today is `mode: "offline"`. So three brands were
  // badged "Mercado conectado · hace N d" over a fixture replay, with a
  // popover asserting "la evidencia de mercado es real".
  //
  // Signals already printed the truth ("Engine · offline run") on its own
  // header. One screen contradicting the chrome on every other screen is the
  // worst of both: the honest string is there to be found, and the confident
  // one is what a brand reads. `engine.mode` comes straight off the payload
  // (engineAdapter line 128) — the fix is to stop ignoring it.
  //
  // `live` still means "a run exists" everywhere else on purpose; dozens of
  // surfaces gate on it and they are right to, because an offline run's
  // TRENDS are real objects to work with. It is the word "conectado" that was
  // wrong, not the decision to render them.
  const scanned = live && engine.mode === "live";
  // ⚠ NOTHING IS KNOWN YET, SO NOTHING IS CLAIMED YET (owner review,
  // 2026-08-13). Until `loadEngine` answers, this block used to fall through
  // every branch to the last one and announce "Datos de muestra" — telling a
  // real tenant, on every reload, that their screen was sample data. The chip
  // is the app's statement about how much to trust what is on screen; it may
  // not make one before it has an answer.
  const truth = engine.status === "unready"
    // ⚠ ALIVE BUT NOT READY — its own answer, not "sin conexión" and certainly
    // not demo. The process is up; the database or the migrations are not. The
    // brand's real data exists and cannot be reached, so the honest thing is to
    // say which of the two is wrong and refuse to draw numbers over it.
    ? { tone: "down", label: "El motor no está listo",
        note: (engine.readiness?.migration === "behind — run alembic upgrade head"
          ? "Las migraciones están atrasadas: el motor responde pero su base no coincide con el código. No uses esta pantalla para decidir."
          : "El motor responde pero no puede servir datos — su base no está disponible. Lo que falta no se reemplaza con datos de muestra.") }
    : !engine.resolved
    ? { tone: "wait", label: "Comprobando el motor…",
        note: "Todavía no sabemos qué marca es ni si hay una corrida. Nada en pantalla está confirmado hasta que esto se resuelva." }
    : !connected && engine.reason === "unreachable"
    ? { tone: "down", label: "Motor sin conexión",
        note: "El motor no responde. Todo lo que ves es de muestra: no sirve para decidir." }
    : scanned
      ? { tone: "live", label: `Datos de mercado · hace ${timeAgo(engine.generatedAt)}`,
          note: "Entorno piloto: la evidencia de mercado es real; los resultados comerciales todavía están sin validar." }
      : live
        // ⚠ "Corrida de archivo" is the operator's word for it, not the
        // designer's (owner walkthrough 2026-08-12). What a freshness chip
        // has to answer is HOW OLD the market evidence is; whether the run
        // was offline or live is the first line of the popover, where the
        // explanation belongs and where it already is.
        ? { tone: "norun", label: `Datos de mercado · hace ${timeAgo(engine.generatedAt)}`,
            note: "La corrida se hizo en modo offline: repite señales guardadas, no salió a buscar al mercado. Las tendencias son objetos reales para trabajar, pero no son una lectura del mercado de hoy y no deberían citarse como tal." }
        : connected
          // ⚠ "REAL" IS THE ENGINE'S WORD, NOT A DEDUCTION FROM REACHABILITY
          // (owner review, 2026-08-13). This branch used to say "Colección
          // real" for every connected brand — so "Marca Piloto (datos
          // inventados)" was introduced by the product's own trust chip as a
          // real collection. `connected` proves the engine answered; only the
          // brand's typed `data_classification` (migration 0063) says what the
          // rows ARE. A brand the engine has not classified gets the neutral
          // label, never the strong one.
          ? (engine.dataClassification === "synthetic"
            ? { tone: "norun", label: "Colección sintética · para práctica",
                note: "Esta marca está marcada como sintética: sus filas se inventaron para probar el producto. Todo es editable y el flujo es real, pero ningún número acá describe un negocio." }
            : engine.dataClassification === "mixed"
              ? { tone: "norun", label: "Colección con datos mixtos",
                  note: "Esta marca mezcla datos reales y sintéticos. Antes de citar un número, confirmá de qué lado viene." }
              : engine.dataClassification === "real"
                ? { tone: "norun", label: "Colección real · sin corrida de mercado",
                    note: "La colección, el plan, las aprobaciones y los resultados son reales y editables. Lo que queda vacío es tendencias, ADN de marca y propuestas." }
                : { tone: "norun", label: "Colección · sin corrida de mercado",
                    note: "La colección es editable y el flujo es real. El motor no clasificó todavía si estos datos son reales o sintéticos." })
          : { tone: "down", label: "Datos de muestra",
              note: "Sin corrida completada. Los números en pantalla son de muestra." };

  // The full-width "Datos de muestra. No uses estos números para decidir"
  // warning bar. Same rule as the chip: an unresolved engine has not told us
  // this screen is sample data, and showing the warning first and retracting it
  // teaches people to ignore it — which is the one thing this bar cannot afford.
  const sampleView = engine.resolved && dataStatus === "sample";

  // ⚠ THE WORLD VIEW IS NOT THIS BRAND'S, so the brand-run status chip is not
  // about it. Left alone, the chrome says "Corrida de archivo · hace 19 días"
  // directly above a shared world forecast that was computed today — two
  // freshness claims on one screen, and the wrong one is the confident one in
  // the header. The world screen carries its OWN freshness (the cycle that
  // produced it), which is the only staleness that means anything there.
  const brandChrome = view !== "world";

  return (
    <div className="ax">
      {navOpen && <div className="ax-scrim" onClick={() => setNavOpen(false)} />}
      <Sidebar active={view} onNavigate={navigate} open={navOpen}
               onClose={() => setNavOpen(false)} brand={brandName} />

      <div className="ax-main">
        <header className="ax-top">
          <button className="ax-burger" aria-label="Menú" onClick={() => setNavOpen((o) => !o)}>
            <Icon name="burger" />
          </button>

          {/* The switcher disappears in presentation mode. A live demo where
              the presenter can accidentally change tenants mid-sentence is a
              demo that eventually does. */}
          {connected && !presenting && (engine.brands?.length || 0) > 1 ? (
            <span className="ax-switch">
              <span className="ax-switch-label">Marca</span>
              <span className="ax-coll">
                <select
                  value={engine.brandName || brandName}
                  onChange={(e) => engine.setBrand(e.target.value)}
                  title="Elegir marca — la selección queda guardada en este navegador"
                  style={{ fontWeight: 650 }}
                >
                  {/* ⚠ The run-state suffix used to read "(sin corrida de
                      mercado)", which made the selected label 55 characters in
                      a 250px control: it needed 403px and got cut mid-word,
                      with no ellipsis, on every screen. A <select> paints the
                      option's own text, so the label has to be short enough to
                      survive closed — "· sin corrida" says the same thing, and
                      the state is spelled out in full by the chip beside it. */}
                  {engine.brands.map((b) => (
                    <option key={b.id} value={b.name}>
                      {b.name}{b.has_result ? "" : " · sin corrida"}
                    </option>
                  ))}
                </select>
              </span>
            </span>
          ) : (
            <span className="ax-switch">
              <span className="ax-switch-label">Marca</span>
              <span className="ax-brand">{brandName}</span>
            </span>
          )}

          <CollectionSwitch view={view} />
          <div className="ax-grow" />

          <div className="ax-pop-wrap">
            <button className="ax-status" onClick={() => setStatusOpen((o) => !o)}
                    aria-expanded={statusOpen}
                    title={brandChrome ? truth.note : WORLD_CHROME.note}>
              <i className={brandChrome ? truth.tone : "live"} />
              {brandChrome ? truth.label : WORLD_CHROME.label}
              <Icon name="chevron" />
            </button>
            {statusOpen && (
              <div className="ax-pop" role="dialog" aria-label="Estado y procedencia">
                <h4>{brandChrome ? truth.label : WORLD_CHROME.label}</h4>
                <p>{brandChrome ? truth.note : WORLD_CHROME.note}</p>
                {sampleView && (
                  <p style={{ color: "var(--clay)" }}>
                    Esta pantalla todavía no está conectada al motor: sus números son de
                    muestra y no deben usarse para decidir.
                  </p>
                )}
                {live && engine.provenance && (
                  <dl>
                    {/* ⚠ WHEN, NOT JUST WHAT (owner walkthrough 2026-08-12).
                        This panel showed `LLM: openai · claude-sonnet-4-6` — a
                        provider and a model that disagree — and it was read as
                        a live inconsistency. It is not: it is the FROZEN
                        provenance of a run from 2026-07-21, minted before
                        `provenance.py` learned to report the model the active
                        provider actually calls. The record is append-only and
                        rewriting it would be worse than the confusion. What was
                        missing is that the panel never said whose run it is
                        describing, so a three-week-old record read as current
                        configuration — on the one panel whose entire job is
                        establishing what you are looking at. */}
                    <dt>Corrida</dt><dd>{engine.mode} · {engine.stats?.nTrends} señales{
                      engine.generatedAt
                        ? ` · ${new Date(engine.generatedAt).toLocaleDateString("es-AR")}`
                        : ""}</dd>
                    <dt>LLM <small style={{ fontWeight: 400, opacity: 0.7 }}>(de esa corrida)</small></dt>
                    <dd>{engine.provenance.llm?.provider || "—"} · {engine.provenance.llm?.analysis_model || "sin modelo"}</dd>
                    <dt>Embeddings</dt><dd>{engine.provenance.embeddings?.mode} · {engine.provenance.embeddings?.text_model}</dd>
                    <dt>Similitud visual</dt>
                    <dd>{engine.provenance.embeddings?.pixels ? "píxeles reales" : "sobre captions, no píxeles"}</dd>
                    <dt>Versiones</dt>
                    <dd>prompts v{engine.provenance.prompt_version} · scoring v{engine.provenance.scoring_version}</dd>
                  </dl>
                )}
              </div>
            )}
          </div>

          {/* ⚠ IDENTITY LIVES IN THE AVATAR (owner walkthrough 2026-08-12).
              SignIn was mounted INSIDE this provenance popover, so the brief
              screen could say "Iniciá sesión para firmar con tu nombre real"
              while the only control was behind a chip about offline crawl
              mode — and the top-right avatar, the thing every tool trains you
              to click, was a non-interactive brand initial. Who is signed in
              is not a detail of the market run. The avatar now carries the
              person; the brand is named inside the menu, where a
              multi-tenant tool has to answer it. */}
          {/* ⚠ REACHABLE FROM EVERY SCREEN, ON PURPOSE. The studio cost three
              or four navigation clicks before the first character could be
              typed, and the thing it competes with is a text box in another
              tab. Nothing about generation needed a collection — the engine
              requires only `authored_prompt`. */}
          {connected && <QuickGenerate onNavigate={navigate} />}
          {/* ⚠ Asking sits beside making, on purpose. The engine has held 80+
              tables of this brand's life with no way to ask them anything —
              the read layer existed with zero callers until this line. */}
          {connected && <AskBox />}
          <SignIn />
        </header>

        {/* Stated once, before anything below it is believed. */}
        <EngineDown />

        {/* ON SCREEN, not in the popover. Folding this into the status menu
            with everything else made it one click away, and a warning you have
            to go looking for is not a warning — this is the single line that
            stops someone deciding on numbers this view invented. The other two
            banners stay collapsed into the status pill; only this one is about
            whether the screen in front of you can be trusted at all. */}
        {sampleView && (
          <div className="ax-warnbar">
            <Icon name="warn" />
            <span>
              <b>Datos de muestra.</b> Esta pantalla todavía no está conectada al
              motor — no uses estos números para decidir.
            </span>
          </div>
        )}

        <div className={`ax-body${read ? "" : " solo"}`}>
          <div style={{ minWidth: 0 }}>
            {/* Which collection you are inside, and which step of it. The
                sidebar answers "which area of work"; this answers "which
                step". Added, not substituted — StageRail keeps its own
                detail below. */}
            {COLLECTION_LINKED_VIEWS.has(view) && (
              <CollectionHeader view={view} onNavigate={navigate} />
            )}
            {/* StageRail only where the header is NOT shown. The tabs carry the
                same six stages with the same engine state strings plus Resumen
                and Conceptos, so rendering both put two rails of the same
                stages on one screen — one boxy, one not. That is duplication,
                not redundancy, and it is why the page read as unfinished. No
                information is lost: everything the rail said, the tabs say. */}
            {!COLLECTION_LINKED_VIEWS.has(view) && (
              <StageRail view={view} onNavigate={navigate} />
            )}
            {/* Keyed on the active brand: switching tenants REMOUNTS the view,
                so a brand switch cannot leave the previous tenant's board on
                screen under the new brand's name. */}
            <div key={engine.brandId || brandName}>{renderView()}</div>
          </div>
          {read && <AtelierRead {...read} />}
        </div>

        {decision && <DecisionBar {...decision} />}
      </div>
    </div>
  );
}
