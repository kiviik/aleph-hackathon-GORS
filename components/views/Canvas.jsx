"use client";
// El Lienzo — the canvas the product was missing.
//
// THE BRIEF THIS ANSWERS (owner, 2026-08-18): "Designers need to work directly
// with visual material, not mainly forms and generated cards. AI should work
// inside this canvas — 'make this sleeve wider', 'apply this fabric only to
// the jacket'. Currently generation produces outputs AROUND the workflow. It
// needs to become part of the designer's hands."
//
// So the arrangement IS the request. A reference on this board is not a row in
// a picker: it has a position, a role and a weight, and when the designer
// types a sentence the board's structure travels with it as a typed
// GenerationIntent — her words verbatim in `authored_prompt`, everything the
// app knows under its own labelled heading, roles and locks as structure. The
// engine answers with a control mapping and `GenerationReceipt` renders IT, so
// a control that is only prompt prose says so on the same screen that offered
// it.
//
// FOUR THINGS THIS SCREEN REFUSES TO DO, each one a specific way canvases lie:
//
//   1. It never edits the whole image when a region was selected. If the
//      engine refuses the masked request — no alpha mask on the model, or the
//      route not yet built — the refusal is shown verbatim and the request
//      STOPS. Retrying it without the mask returns a plausible picture in
//      which everything she was protecting has silently moved.
//   2. It never replaces a card. A result is a CHILD, drawn with a link to
//      its parent, because the engine records `parent_asset_id` and a board
//      that overwrote the source would destroy the only record of what the
//      edit was applied to.
//   3. It never calls a generation a photograph or a try-on. Generated cards
//      wear «generado», permanently.
//   4. It never pretends a dropped file is a reference. Bytes the engine has
//      no row for cannot be fetched by the engine; the card says so and the
//      prompt bar counts them out loud instead of quietly sending fewer
//      references than the board shows.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import CanvasCard from "@/components/canvas/CanvasCard";
import CanvasCompare from "@/components/canvas/CanvasCompare";
import CanvasInspector from "@/components/canvas/CanvasInspector";
import CanvasPrompt from "@/components/canvas/CanvasPrompt";
import CanvasStyles from "@/components/canvas/CanvasStyles";
import { useCollection } from "@/components/CollectionProvider";
import { useEngine } from "@/components/EngineProvider";
import { capReached, listAssets } from "@/lib/assets";
import {
  BOARD_KEY, assetObjectUrl, boardIntent, bringToFront, childPlacement,
  editAsset, engineRefusal, exportBoardJson, fetchBoard, freshBoard,
  generateFromBoard, ingestAsset, lineageEdges, makeImageCard, makeNoteCard,
  makeStroke, maskPng, normalizeRect, pushBoard, reconcileBoards,
  regionCoverage, regionToImagePixels, reviveBoard, screenToBoard,
  serializeBoard, zoomAt,
} from "@/lib/canvas.mjs";
import { readScoped, writeScoped } from "@/lib/brandStore";

const TOOLS = [
  { id: "select", label: "Mover" },
  { id: "pen", label: "Lápiz" },
  { id: "note", label: "Nota" },
  { id: "region", label: "Región" },
];

// The ledger's own limits, so a file that cannot be stored is named here
// rather than becoming a 413 in the middle of a drop of forty images.
const INGEST_MIMES = ["image/png", "image/jpeg", "image/webp"];
const MAX_INGEST_BYTES = 8_000_000;

const CARD_W = 320;

export default function Canvas() {
  const engine = useEngine();
  const collection = useCollection();
  const brandId = engine.connected ? engine.brandId : null;

  const [board, setBoard] = useState(freshBoard);
  const [loaded, setLoaded] = useState(false);
  const [tool, setTool] = useState("select");
  const [selected, setSelected] = useState([]);
  const [region, setRegion] = useState(null);      // { cardId, rect } in board units
  const [marquee, setMarquee] = useState(null);
  const [library, setLibrary] = useState(undefined);
  const [dropping, setDropping] = useState(false);
  const [comparing, setComparing] = useState(false);

  const [authored, setAuthored] = useState("");
  const [tier, setTier] = useState("balanced");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState(null);
  const [error, setError] = useState(null);
  const [lastSent, setLastSent] = useState(null);
  const [storageWarning, setStorageWarning] = useState(null);
  // WHERE THE BOARD ACTUALLY IS, in the four states that are not the same
  // thing: on the engine, only in this browser, in conflict with another
  // session, or refused by the engine for a named reason. The chip renders this
  // verbatim, because a designer who believes her arrangement is on a server
  // when it is not will lose it (engine 0088).
  const [sync, setSync] = useState({ state: "loading", revision: 0,
                                     message: null, localIsNewer: false });
  const revisionRef = useRef(0);

  const surfaceRef = useRef(null);
  const fileRef = useRef(null);
  const dragRef = useRef(null);
  const boardRef = useRef(board);
  boardRef.current = board;

  const view = board.view;
  const cards = board.cards;
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const primary = selected.length ? byId.get(selected[0]) : null;

  // ---------------------------------------------------------------- state --

  const patchCard = useCallback((id, patch) => {
    setBoard((b) => ({
      ...b,
      cards: b.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  }, []);

  const addCards = useCallback((made) => {
    setBoard((b) => {
      const base = b.cards.reduce((m, c) => Math.max(m, c.z || 0), 0) + 1;
      return { ...b, cards: [...b.cards, ...made.map((c, i) => ({ ...c, z: base + i }))] };
    });
  }, []);

  // ---- persistence. ⚠ THE PIXELS DO NOT PERSIST AND THE CHIP SAYS SO. ------
  // A board lives in this browser only: localStorage, brand-scoped through
  // lib/brandStore.js so brand A's arrangement can never surface under brand
  // B's name. Dropped bytes are deliberately not stored — one photograph as
  // base64 outweighs the whole quota — so a card reloads as a labelled
  // absence rather than as a broken image.
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setSync({ state: "loading", revision: 0, message: null, localIsNewer: false });

    (async () => {
      const local = reviveBoard(readScoped(BOARD_KEY, brandId, null));
      const remote = await fetchBoard(brandId);
      if (cancelled) return;

      let next = local || freshBoard();
      let state = brandId ? "local" : "no_brand";
      let message = null;
      let revision = 0;
      let localIsNewer = false;

      if (remote.ok && remote.exists && remote.board) {
        // The shared copy governs — it is the one another machine can see.
        const merged = reconcileBoards(remote.board, local);
        next = merged.board;
        localIsNewer = merged.localIsNewer;
        revision = remote.revision;
        state = "engine";
        if (localIsNewer) {
          // ⚠ NOT resolved for her. Local work that never reached the server is
          // real, and picking a winner silently is the one thing this must not
          // do with somebody's afternoon.
          message = "hay una copia local más nueva que la del motor — "
            + "exportá antes de seguir si te falta algo";
        }
      } else if (remote.ok && remote.exists && remote.unreadable) {
        state = "refused";
        message = "el tablero guardado fue escrito por otra versión de esta "
          + "pantalla y no se interpreta a medias";
        next = local || freshBoard();
      } else if (remote.ok && !remote.exists && local) {
        // The pre-0088 board: it existed only here. Send it up once, so the
        // next machine sees it.
        const up = await pushBoard(brandId, local);
        if (cancelled) return;
        revision = up.ok ? (up.revision ?? 0) : 0;
        state = up.ok ? "engine" : "local";
        message = up.ok ? null : up.message || null;
      } else if (remote.ok && !remote.exists) {
        state = "engine_empty";
      } else if (remote.reason === "unreachable") {
        message = "sin conexión con el motor";
      } else if (remote.reason === "http") {
        message = `el motor respondió ${remote.status}`;
      }

      revisionRef.current = revision;
      setBoard(next);
      setSelected([]);
      setRegion(null);
      setLastSent(null);
      setSync({ state, revision, message, localIsNewer });
      setLoaded(true);

      // Ledger-backed cards come back with their bytes, through the authorised
      // route — an <img src> cannot carry the bearer token, so the content is
      // fetched and handed to the card as an object URL.
      for (const c of next.cards) {
        if (c.kind !== "image" || !c.url || c.src) continue;
        try {
          const src = await assetObjectUrl(c.url);
          if (!cancelled) patchCard(c.id, { src, missing: false });
        } catch { /* the card keeps saying the pixels are not here */ }
      }
    })();
    return () => { cancelled = true; };
  }, [brandId, patchCard]);

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      // The local copy is written FIRST and always: it is the cache that makes
      // a network failure survivable, and it costs nothing when the push works.
      const res = writeScoped(BOARD_KEY, brandId, serializeBoard(boardRef.current));
      setStorageWarning(res.ok ? null : res.message);
      if (!brandId) return;
      // ⚠ A CONFLICTED BOARD IS NOT PUSHED AGAIN. Another session wrote after
      // we read; sending ours now would erase their work, which is exactly what
      // the 409 exists to prevent. It stays local until she reloads.
      if (sync.state === "conflict") return;

      const up = await pushBoard(brandId, boardRef.current,
                                 { revision: revisionRef.current || null });
      if (cancelled) return;
      if (up.ok) {
        revisionRef.current = up.revision ?? revisionRef.current;
        setSync((s) => ({ ...s, state: "engine", revision: revisionRef.current,
                          message: null, localIsNewer: false }));
        return;
      }
      if (up.reason === "conflict") {
        setSync({ state: "conflict", revision: up.revision ?? 0,
                  message: up.message, localIsNewer: false });
        return;
      }
      setSync((s) => ({
        ...s,
        state: up.reason === "unreachable" ? "local" : "refused",
        message: up.reason === "unreachable" ? "sin conexión con el motor"
          : up.message || "el motor rechazó el tablero",
      }));
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [board, brandId, loaded, sync.state]);

  // ---- the brand's library -------------------------------------------------
  useEffect(() => {
    if (!brandId) { setLibrary(undefined); return; }
    let cancelled = false;
    setLibrary(undefined);
    (async () => {
      try {
        const data = await listAssets(brandId, { limit: 24 });
        const rows = data?.assets || [];
        const withSrc = [];
        for (const a of rows) {
          try { withSrc.push({ ...a, href: await assetObjectUrl(a.url) }); }
          catch { /* one unreadable row is not an empty library */ }
        }
        if (!cancelled) setLibrary(withSrc);
      } catch {
        // ⚠ null, NOT []. "Could not ask" and "asked and there is none" are
        // different answers and the rail renders different sentences for them.
        if (!cancelled) setLibrary(null);
      }
    })();
    return () => { cancelled = true; };
  }, [brandId]);

  // ------------------------------------------------------------- geometry --

  const screenPoint = (e) => {
    const rect = surfaceRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const boardPoint = (e) => screenToBoard(screenPoint(e), boardRef.current.view);

  // Wheel must be a non-passive listener or the page scrolls behind the zoom.
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const at = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      setBoard((b) => ({ ...b, view: zoomAt(b.view, at, e.deltaY < 0 ? 1.1 : 1 / 1.1) }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // -------------------------------------------------------------- pointer --

  function onPointerDown(e) {
    if (e.target?.dataset?.nodrag) return;          // typing in a note
    const el = surfaceRef.current;
    el.setPointerCapture?.(e.pointerId);
    const pt = boardPoint(e);
    const resizeId = e.target?.dataset?.resize;
    const cardEl = e.target?.closest?.("[data-card]");
    const cardId = cardEl?.dataset?.card || null;

    if (resizeId) {
      const card = byId.get(resizeId);
      dragRef.current = { mode: "resize", id: resizeId, start: pt,
                          w0: card.w, h0: card.h };
      return;
    }
    if (tool === "pen") {
      dragRef.current = { mode: "pen", points: [pt] };
      setBoard((b) => ({ ...b, strokes: [...b.strokes, makeStroke([pt])] }));
      return;
    }
    if (tool === "note") {
      addCards([makeNoteCard({ x: pt.x, y: pt.y })]);
      setTool("select");
      return;
    }
    if (tool === "region") {
      if (!cardId) return;
      const card = byId.get(cardId);
      if (!card || card.kind !== "image") return;
      setSelected([cardId]);
      dragRef.current = { mode: "region", id: cardId, start: pt };
      setRegion({ cardId, rect: { x: pt.x, y: pt.y, w: 0, h: 0 } });
      return;
    }
    // select / move / pan
    if (cardId) {
      const card = byId.get(cardId);
      setSelected((s) => (e.shiftKey
        ? (s.includes(cardId) ? s.filter((i) => i !== cardId) : [...s, cardId])
        : [cardId]));
      if (!e.shiftKey) setRegion((r) => (r?.cardId === cardId ? r : null));
      setBoard((b) => ({ ...b, cards: bringToFront(b.cards, cardId) }));
      dragRef.current = { mode: "move", id: cardId, start: pt, x0: card.x, y0: card.y };
      return;
    }
    if (e.altKey || e.button === 1) {
      dragRef.current = { mode: "pan", start: screenPoint(e), view };
      return;
    }
    dragRef.current = { mode: "marquee", start: pt, screen: screenPoint(e), view };
    setMarquee({ x: pt.x, y: pt.y, w: 0, h: 0 });
  }

  function onPointerMove(e) {
    const d = dragRef.current;
    if (!d) return;
    if (d.mode === "pan") {
      const now = screenPoint(e);
      setBoard((b) => ({ ...b, view: { ...b.view, x: d.view.x + now.x - d.start.x,
                                       y: d.view.y + now.y - d.start.y } }));
      return;
    }
    const pt = boardPoint(e);
    if (d.mode === "move") {
      patchCard(d.id, { x: d.x0 + pt.x - d.start.x, y: d.y0 + pt.y - d.start.y });
      if (region?.cardId === d.id) setRegion(null);
      return;
    }
    if (d.mode === "resize") {
      const card = byId.get(d.id);
      const w = Math.max(40, d.w0 + pt.x - d.start.x);
      // Images keep their aspect: a stretched card would make the region→pixel
      // mapping produce a rectangle the source image does not contain.
      const h = card.kind === "image" && card.natural
        ? w * (card.natural.height / card.natural.width)
        : Math.max(40, d.h0 + pt.y - d.start.y);
      patchCard(d.id, { w, h });
      return;
    }
    if (d.mode === "pen") {
      d.points.push(pt);
      setBoard((b) => {
        const strokes = [...b.strokes];
        strokes[strokes.length - 1] = { ...strokes[strokes.length - 1],
                                        points: [...d.points] };
        return { ...b, strokes };
      });
      return;
    }
    if (d.mode === "region") {
      setRegion({ cardId: d.id, rect: normalizeRect(d.start, pt) });
      return;
    }
    if (d.mode === "marquee") {
      // A drag on empty board pans; the marquee only exists so the gesture is
      // visible. Panning IS the primary empty-space gesture on a board.
      const now = screenPoint(e);
      setMarquee(null);
      dragRef.current = { mode: "pan", start: d.screen, view: d.view };
      setBoard((b) => ({ ...b, view: { ...b.view, x: d.view.x + now.x - d.screen.x,
                                       y: d.view.y + now.y - d.screen.y } }));
    }
  }

  function onPointerUp() {
    const d = dragRef.current;
    dragRef.current = null;
    setMarquee(null);
    if (d?.mode === "marquee") setSelected([]);
    if (d?.mode === "region") setTool("select");
  }

  // ----------------------------------------------------------------- files --

  const placeAt = () => {
    // The middle of what is currently on screen, in board units.
    const el = surfaceRef.current;
    const rect = el ? el.getBoundingClientRect() : { width: 900, height: 600 };
    return screenToBoard({ x: rect.width / 2 - 160, y: rect.height / 2 - 160 },
                         boardRef.current.view);
  };

  const readDataUri = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("no se pudo leer el archivo"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });

  const acceptFiles = useCallback(async (files, at) => {
    const images = [...files].filter((f) => f.type?.startsWith("image/"));
    if (!images.length) return;
    const origin = at || placeAt();
    const made = images.map((f, i) => makeImageCard({
      src: URL.createObjectURL(f), local: true, name: f.name,
      x: origin.x + i * (CARD_W + 20), y: origin.y, w: CARD_W, h: CARD_W,
    }));
    addCards(made);

    // ⚠ A DROPPED FILE BECOMES A REFERENCE ONLY BY BECOMING A ROW. The intent
    // takes an `asset_id` or a `url`; a `blob:` address is neither, so an
    // image that stays in this tab can be looked at and drawn on and cannot
    // be sent. Offering it to the brand's own ledger is what makes it usable
    // — and when that fails, the card keeps saying so rather than failing at
    // generation time with a reference the designer thought she had sent.
    if (!brandId) return;
    for (let i = 0; i < images.length; i++) {
      const file = images[i];
      const card = made[i];
      if (!INGEST_MIMES.includes(file.type) || file.size > MAX_INGEST_BYTES) {
        patchCard(card.id, {
          name: `${file.name} · ${!INGEST_MIMES.includes(file.type)
            ? "el ledger no guarda este formato" : "supera los 8 MB del ledger"}`,
        });
        continue;
      }
      try {
        const row = await ingestAsset(brandId, {
          data_uri: await readDataUri(file),
          client_key: `canvas-${card.id}`,
          collection_id: collection?.activeId || null,
        });
        patchCard(card.id, { assetId: row.id, url: row.url, local: false });
      } catch (err) {
        patchCard(card.id, {
          name: `${file.name} · no se pudo subir (${err?.status || "sin respuesta"})`,
        });
      }
    }
  }, [addCards, brandId, collection?.activeId, patchCard]);

  function onDrop(e) {
    e.preventDefault();
    setDropping(false);
    acceptFiles(e.dataTransfer?.files || [], boardPoint(e));
  }

  const addFromLibrary = useCallback((asset) => {
    const at = placeAt();
    addCards([makeImageCard({
      assetId: asset.id, url: asset.url, src: asset.href, name: asset.prompt
        ? asset.prompt.slice(0, 60) : (asset.operation || "activo"),
      x: at.x, y: at.y, w: CARD_W, h: CARD_W,
      origin: asset.operation === "ingest" ? "ingested" : "generated",
    })]);
  }, [addCards]);

  // ------------------------------------------------------------ generation --

  const regionCard = region ? byId.get(region.cardId) : null;
  const regionPixels = regionCard && regionCard.natural && region
    ? regionToImagePixels(regionCard, region.rect, regionCard.natural) : null;

  const intentParts = useMemo(() => boardIntent(board, {
    authored,
    // What Atelier adds, under its own heading — never mixed into her words.
    context: [engine.brandName ? `Marca: ${engine.brandName}.` : null,
              collection?.active?.name ? `Colección: ${collection.active.name}.` : null]
      .filter(Boolean).join(" ") || null,
  }), [board, authored, engine.brandName, collection?.active?.name]);

  const editing = !!(regionCard && region && region.rect.w > 0.5 && region.rect.h > 0.5);
  const editReady = !!(editing && regionCard.assetId && regionPixels);

  const mode = editing ? {
    kind: "edit", card: regionCard, pixels: regionPixels,
    natural: regionCard.natural,
    coverage: regionCoverage(regionPixels, regionCard.natural),
    ready: editReady,
    blockedReason: !regionCard.assetId
      ? "Esta imagen solo existe en este navegador: el motor no tiene una fila "
        + "para editarla. Subila a la biblioteca primero."
      : !regionCard.natural
        ? "Todavía no se leyó el tamaño real de la imagen; sin él la máscara "
          + "iría en píxeles equivocados."
        : null,
  } : {
    kind: "board",
    referenceCount: intentParts.references.length,
    lockCount: (board.locks || []).length,
  };

  const disabledReason = !brandId
    ? "Sin marca resuelta no hay ledger donde generar: el motor exige la marca "
      + "en la ruta y ninguna generación puede quedar sin dueño."
    : null;

  async function send() {
    const { intent, references } = intentParts;
    if (!intent) return;
    setBusy(true); setRefusal(null); setError(null);
    const base = editing ? regionCard : (primary?.kind === "image" ? primary : null);
    try {
      let data;
      if (editing) {
        // ⚠ THE MASK IS BUILT FROM THE SOURCE IMAGE'S OWN PIXELS, and its
        // transparent rectangle is the region she dragged. Alpha 0 = edit
        // here; everything else stays opaque and must not move.
        const maskDataUri = await maskPng({
          width: regionCard.natural.width, height: regionCard.natural.height,
          region: regionPixels,
        });
        data = await editAsset(brandId, {
          assetId: regionCard.assetId, maskDataUri, intent, tier,
          collection_id: collection?.activeId || null,
        }, { idempotencyKey: `canvas-edit-${regionCard.id}-${Date.now()}` });
      } else {
        data = await generateFromBoard(brandId, {
          intent, tier,
          parentAssetId: base?.assetId || null,
          collectionId: collection?.activeId || null,
        }, { idempotencyKey: `canvas-gen-${Date.now()}` });
      }

      const asset = (data?.assets || []).find((a) => a?.url);
      setLastSent({
        authored: intent.authored_prompt,
        context: intent.atelier_context || null,
        intent,
        controlMapping: data?.control_mapping || null,
        requestedModel: data?.model || null,
        model: asset?.model || null,
      });
      if (!asset) {
        setError(data?.error === "quota"
          ? "Sin cupo de generación para esta marca."
          : "El motor respondió sin imágenes. No se inventa una en su lugar.");
        return;
      }
      // A RESULT IS A CHILD. Never a replacement — the parent stays exactly
      // where it was, and the link between them is drawn.
      const parent = base || references[0] || null;
      const siblings = parent ? cards.filter((c) => c.parentId === parent.id).length : 0;
      const at = parent ? childPlacement(parent, siblings) : placeAt();
      let src = null;
      try { src = await assetObjectUrl(asset.url); } catch { /* labelled below */ }
      addCards([makeImageCard({
        assetId: asset.id, url: asset.url, src,
        name: intent.authored_prompt.slice(0, 60),
        x: at.x, y: at.y, w: at.w || CARD_W, h: at.h || CARD_W,
        parentId: parent?.id || null, origin: "generated",
        promptSent: asset.prompt || null,
      })]);
      setRegion(null);
    } catch (err) {
      // ⚠ A REFUSAL IS AN ANSWER AND IS SHOWN VERBATIM. It is never retried as
      // a whole-image generation: on a masked request that retry rewrites
      // everything the mask was protecting, and the result would look fine.
      const said = engineRefusal(err?.body);
      if (said) setRefusal(said);
      else if (capReached(err)) {
        setError("Se alcanzó el tope de generaciones que fijó la marca. "
                 + "No es una falla del proveedor.");
      } else {
        setError(`El motor no completó el pedido (${err?.status || "sin respuesta"}).`);
      }
    } finally {
      setBusy(false);
    }
  }

  // ---------------------------------------------------------------- export --

  const download = (href, filename) => {
    const a = document.createElement("a");
    a.href = href; a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  async function exportPng(card) {
    if (!card?.src) {
      setError("Esa tarjeta no tiene píxeles en esta sesión.");
      return;
    }
    try {
      const blob = await (await fetch(card.src)).blob();
      const href = URL.createObjectURL(blob);
      download(href, `${(card.name || "lienzo").replace(/[^\w.-]+/g, "-").slice(0, 60)}.png`);
      setTimeout(() => URL.revokeObjectURL(href), 4000);
    } catch {
      setError("No se pudo leer la imagen para exportarla.");
    }
  }

  function exportJson() {
    const json = exportBoardJson(board, { brandId, brandName: engine.brandName });
    const href = URL.createObjectURL(
      new Blob([JSON.stringify(json, null, 2)], { type: "application/json" }));
    download(href, "lienzo.json");
    setTimeout(() => URL.revokeObjectURL(href), 4000);
  }

  // ------------------------------------------------------------------ view --

  const edges = useMemo(() => lineageEdges(cards), [cards]);
  const compareCards = selected.map((id) => byId.get(id))
    .filter((c) => c && c.kind === "image");

  return (
    <div className="lz">
      <CanvasStyles />

      <p className="lz-eyebrow">
        Diseño <span>·</span> <span>Colección</span>
      </p>
      <h1 className="lz-title">Lienzo</h1>
      <p className="lz-lede">
        Soltá imágenes, marcá para qué sirve cada una, dibujá encima y pedile un
        cambio al modelo sobre la región que seleccionaste. Nada se reemplaza:
        cada resultado entra como hijo de la tarjeta que lo originó.
      </p>

      <div className="lz-frame">
        <div className="lz-bar">
          <div className="lz-tools">
            {TOOLS.map((t) => (
              <button key={t.id} type="button"
                      className={`lz-tool${tool === t.id ? " on" : ""}`}
                      onClick={() => setTool(t.id)}>{t.label}</button>
            ))}
          </div>
          <button type="button" className="lz-btn" onClick={() => fileRef.current?.click()}>
            Agregar imágenes
          </button>
          <input ref={fileRef} className="lz-file" type="file" accept="image/*" multiple
                 onChange={(e) => { acceptFiles(e.target.files); e.target.value = ""; }} />
          <button type="button" className="lz-btn" disabled={compareCards.length !== 2}
                  onClick={() => setComparing(true)}>
            Comparar dos
          </button>
          <button type="button" className="lz-btn danger" disabled={!selected.length}
                  onClick={() => {
                    setBoard((b) => ({ ...b,
                      cards: b.cards.filter((c) => !selected.includes(c.id)) }));
                    setSelected([]); setRegion(null);
                  }}>
            Eliminar
          </button>
          <span className="lz-spacer" />
          <span className="lz-zoom">
            {Math.round(view.k * 100)} % · {cards.length} tarjeta{cards.length === 1 ? "" : "s"}
          </span>
          <button type="button" className="lz-btn"
                  onClick={() => setBoard((b) => ({ ...b, view: { x: 0, y: 0, k: 1 } }))}>
            Centrar
          </button>
        </div>

        {/* ⚠ THE SCOPE CHIP, AND IT NOW REPORTS WHERE THE BOARD REALLY IS.
            Saying so is not a disclaimer — a designer who believes her
            arrangement is on a server when it is only in this tab will lose it,
            and the reverse (still saying "solo en este navegador" after the
            engine stored it) teaches her to distrust a sentence that is true.
            Engine 0088. */}
        <div className="lz-bar" style={{ borderBottom: "1px solid var(--line)" }}>
          <span className="lz-zoom">
            {sync.state === "loading" ? "Abriendo el tablero…" : null}
            {sync.state === "engine"
              ? `Tablero guardado en el motor · rev ${sync.revision}` : null}
            {sync.state === "engine_empty"
              ? "Tablero nuevo — se guarda al primer cambio" : null}
            {sync.state === "conflict"
              ? "Otra sesión guardó este tablero — recargá antes de seguir "
                + "(no se está guardando)" : null}
            {sync.state === "refused" ? "El motor no aceptó el tablero" : null}
            {sync.state === "local" ? "Tablero solo en este navegador" : null}
            {sync.state === "no_brand" ? "Sin marca resuelta" : null}
            {sync.message ? ` · ${sync.message}` : ""}
            {storageWarning ? ` · ${storageWarning}` : ""}
          </span>
        </div>

        <div className="lz-body">
          <div
            ref={surfaceRef}
            className={`lz-surface${dragRef.current?.mode === "pan" ? " panning" : ""}`
              + `${tool === "pen" || tool === "region" ? " drawing" : ""}`
              + `${dropping ? " dropping" : ""}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDragOver={(e) => { e.preventDefault(); setDropping(true); }}
            onDragLeave={() => setDropping(false)}
            onDrop={onDrop}
          >
            <div className="lz-world"
                 style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
              {/* lineage links, under the cards */}
              <svg className="lz-ink" width="1" height="1" style={{ zIndex: 0 }}>
                {edges.map(({ from, to }) => (
                  <line key={`${from.id}-${to.id}`}
                        x1={from.x + from.w} y1={from.y + from.h / 2}
                        x2={to.x} y2={to.y + to.h / 2}
                        stroke="var(--inferred)" strokeWidth={2 / view.k}
                        strokeDasharray={`${6 / view.k} ${4 / view.k}`} />
                ))}
              </svg>

              {cards.map((card) => (
                <CanvasCard key={card.id} card={card}
                            selected={selected.includes(card.id)}
                            onImageLoad={(id, natural) => {
                              const c = boardRef.current.cards.find((x) => x.id === id);
                              if (!c) return;
                              patchCard(id, { natural,
                                h: c.natural ? c.h : c.w * (natural.height / natural.width) });
                            }}
                            onNoteChange={(id, text) => patchCard(id, { text })} />
              ))}

              {/* pen strokes ride in board units, so they pan and zoom with
                  the work instead of floating over the viewport */}
              <svg className="lz-ink" width="1" height="1" style={{ zIndex: 30 }}>
                {board.strokes.map((s) => (
                  <polyline key={s.id} fill="none" stroke="var(--ink)"
                            strokeWidth={s.width} strokeLinecap="round"
                            strokeLinejoin="round"
                            points={s.points.map((p) => `${p.x},${p.y}`).join(" ")} />
                ))}
              </svg>

              {region && (
                <div className="lz-region" style={{
                  left: region.rect.x, top: region.rect.y,
                  width: region.rect.w, height: region.rect.h, zIndex: 35,
                }} />
              )}
              {marquee && (
                <div className="lz-marquee" style={{
                  left: marquee.x, top: marquee.y,
                  width: marquee.w, height: marquee.h, zIndex: 35,
                }} />
              )}
            </div>

            {cards.length === 0 && (
              <div className="lz-empty">
                <div>
                  El lienzo está vacío. Soltá imágenes desde el escritorio o
                  traelas de la biblioteca de la marca. Con la rueda acercás,
                  arrastrando el fondo movés el tablero.
                </div>
              </div>
            )}

            {comparing && compareCards.length === 2 && (
              <CanvasCompare cards={compareCards} onClose={() => setComparing(false)} />
            )}
          </div>

          <CanvasInspector
            card={primary} board={board} library={library} brandId={brandId}
            busy={busy}
            onRole={(id, role) => patchCard(id, { role })}
            onStrength={(id, strength) => patchCard(id, { strength })}
            onToggleLock={(lock) => setBoard((b) => ({ ...b,
              locks: b.locks.includes(lock) ? b.locks.filter((l) => l !== lock)
                                            : [...b.locks, lock] }))}
            onExclusions={(exclusions) => setBoard((b) => ({ ...b, exclusions }))}
            onAddFromLibrary={addFromLibrary}
            onExportPng={exportPng}
            onExportJson={exportJson}
          />
        </div>

        <CanvasPrompt
          authored={authored} onAuthored={setAuthored}
          mode={mode} tier={tier} onTier={setTier} onSend={send} busy={busy}
          refusal={refusal} error={error} lastSent={lastSent}
          skipped={intentParts.skipped} overflow={intentParts.overflow}
          disabledReason={disabledReason} />
      </div>
    </div>
  );
}
