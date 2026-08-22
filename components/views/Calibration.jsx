"use client";
// Calibración de gusto — VISUAL (2026-07-25).
//
// What this view was, and why it changed. The 07-21 audit created it because
// brand fit was an uncalibrated 50/20/30 blend shown as a number; the fix was
// to collect blind pairwise preferences and learn a Bradley-Terry order that
// refuses to print a percentage until a held-out split beats chance. That part
// was right and is untouched.
//
// What was wrong was the INPUT. The pool came from `engine.trends`, and each
// side rendered as a trend NAME over a COLOUR SWATCH. A designer was being
// asked which of two market labels is more like the brand, and their answer
// trained the thing the product calls brand fit. Whatever that measured, it
// was not taste in garments — the owner's reading, 2026-07-25: "calibration
// compares market trends, rather than actual product images from the brand."
//
// Now both sides are real photographs, from the brand's own archive and its
// generated concepts (`GET /brands/{id}/fit/pool`), and the engine chooses the
// pair it is least certain about instead of walking an index
// (`GET .../fit/next-pair`, `atelier/fit_pairing.py`).
//
// Two honesty rules kept from the original, and one added:
//   · BLIND — no strengths, no scores on the comparison card. Showing the
//     model's current opinion while asking for a human's anchors the answer.
//   · The order is PROVISIONAL until the held-out split clears chance.
//   · NEW: the five taste dimensions never pool. A garment can be beautiful and
//     commercially reckless, and that disagreement is the signal — so each
//     question keeps its own ranking, count and calibration gate.
//
// Not claimed anywhere on this screen: that a model looked at these pixels. The
// engine serves images and learns a rank from human choices. The 07-21
// evaluation found the available visual models lose to captions and that
// silhouette judgement is unmeasurable without labels; this screen is where
// those labels start existing.
import { useCallback, useEffect, useRef, useState } from "react";
import { useBrandId } from "@/components/EngineProvider";
import { engineFetch } from "@/lib/auth";
import { reasonText } from "@/lib/reasons.mjs";

const API_BASE = process.env.NEXT_PUBLIC_ATELIER_API || "http://127.0.0.1:8000";

const SOURCE_LABEL = { archive: "archivo", concept: "concepto" };

// One side of the comparison. The garment leads — the label is caption, not
// subject: the whole point of the rewrite is that a judgment is about the
// picture, not the words next to it.
function Side({ item, onPick }) {
  return (
    // Never disabled: the answer is optimistic, so the next pair is already on
    // screen before the previous POST lands. A disabled button between answers
    // is the round trip made visible.
    <button className="cal-opt" onClick={onPick}>
      <figure>
        {/* The garment is the question, so it is never lazy — deferring it puts
            latency on the one thing the person is here to look at. `eager` +
            high priority; the ranking thumbnails below stay lazy. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.image} alt={item.label} loading="eager" fetchPriority="high" />
      </figure>
      <b>{item.label}</b>
      {item.sub && <span>{item.sub}</span>}
      <span className="cal-src">{SOURCE_LABEL[item.source] || item.source}</span>
    </button>
  );
}

export default function Calibration() {
  // useBrandId, not `status === "live" ? brandId : null`: calibration reads the
  // brand's archive and concepts, which exist with or without a market run. The
  // old idiom made this screen unreachable for a brand that had never run one.
  const brandId = useBrandId();

  const [dimension, setDimension] = useState("creative");
  const [dimensions, setDimensions] = useState([]);
  const [pool, setPool] = useState(null);
  const [meta, setMeta] = useState(null);      // question, coverage, exhausted
  const [queue, setQueue] = useState([]);      // pairs ready to be answered
  const [ranking, setRanking] = useState(null);
  const [answered, setAnswered] = useState(0); // this session
  const [failed, setFailed] = useState([]);    // judgments the engine refused
  // Pairs answered this session, so a double-fire cannot cast a second vote.
  // A ref, not state: it must be current WITHIN a tick, before any re-render.
  const answeredKeys = useRef(new Set());

  const get = useCallback((p) => engineFetch(`${API_BASE}/brands/${brandId}${p}`)
    .then((r) => (r.ok ? r.json() : null)).catch(() => null), [brandId]);

  // The pool is stable within a session — refetching it after every answer was
  // most of what made the old screen feel slow.
  useEffect(() => {
    if (!brandId) { setPool(null); return; }
    get("/fit/pool").then(setPool);
  }, [brandId, get]);

  // Everything that changes as judgments land. Deliberately NOT awaited by the
  // answer path: the ranking is reference material, not part of the loop.
  const refreshRanking = useCallback(async () => {
    const [r, d] = await Promise.all([
      get(`/fit/ranking?dimension=${dimension}`), get("/fit/dimensions")]);
    if (r) setRanking(r);
    if (d) setDimensions(d.items || []);
  }, [get, dimension]);

  const fillQueue = useCallback(async (replace = false) => {
    const n = await get(`/fit/next-pair?dimension=${dimension}&limit=24`);
    if (!n) return;
    setMeta(n);
    setQueue((current) => {
      const keep = replace ? [] : current;
      const have = new Set(keep.map((p) => [p[0].key, p[1].key].sort().join("|")));
      const fresh = (n.pairs || []).filter((p) => {
        const k = [p[0].key, p[1].key].sort().join("|");
        return !have.has(k) && (have.add(k), true);
      });
      return [...keep, ...fresh];
    });
  }, [get, dimension]);

  // Reads brandId and dimension (through the callbacks), so both are declared —
  // the brand-switch invariant (tests/brandSwitch.test.mjs).
  useEffect(() => {
    if (!brandId) return;
    setQueue([]); setAnswered(0); setFailed([]);
    fillQueue(true); refreshRanking();
  }, [brandId, dimension, fillQueue, refreshRanking]);

  const pair = queue[0] || null;

  // A refused judgment must be answerable again, so it leaves the answered set
  // when it goes back on the queue.
  const requeue = (p, key) => {
    answeredKeys.current.delete(key);
    setFailed((f) => [...f, p]);
    setAnswered((n) => Math.max(0, n - 1));
    setQueue((q) => [...q, p]);
  };

  /**
   * Answer, and move on WITHOUT waiting for the server.
   *
   * The 07-21 rule this bends, and why it is still kept: "only advance when the
   * server recorded it — a 4xx used to still say Juicio registrado and drop the
   * pair, a silently lost judgment that corrupts the ranking it was meant to
   * train." That was right about the danger and wrong about the remedy, because
   * the remedy put a round trip between every answer, and a hundred of those is
   * a session nobody finishes.
   *
   * So the advance is optimistic and the GUARANTEE moves: a refused judgment is
   * pushed back onto the queue and counted in a banner that stays until it is
   * resolved. Nothing is lost, and nothing is lost SILENTLY — which was always
   * the actual requirement.
   */
  function judge(winnerIdx) {
    if (!pair || !brandId) return;
    const [a, b] = pair;
    // Two clicks (or a held arrow key) can fire before React repaints, and both
    // would read the same head of the queue and post the same comparison twice
    // — which is not a duplicate the server can dedupe, it is a second vote.
    // Caught by clicking ten times in one tick; a held key does the same thing.
    const key = [a.key, b.key].sort().join("|");
    if (answeredKeys.current.has(key)) return;
    answeredKeys.current.add(key);

    setQueue((q) => q.slice(1));
    setAnswered((n) => n + 1);

    engineFetch(`${API_BASE}/brands/${brandId}/fit/judgments`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        key_a: a.key, key_b: b.key, winner: winnerIdx === 0 ? "a" : "b",
        // Snapshot what was actually on screen, image included: the judgment
        // has to stay interpretable after the catalog moves on.
        candidate_a: a, candidate_b: b, dimension,
      }),
    }).then((res) => {
      if (res.ok) return;
      requeue(pair, key);
    }).catch(() => requeue(pair, key));
  }

  // Refill before running dry, and re-plan on evidence that has moved. Every
  // refill asks the engine again, so the queue's later pairs are never stale
  // for long.
  useEffect(() => {
    if (!brandId || !answered) return;
    if (queue.length <= 4) fillQueue();
    if (answered % 5 === 0) refreshRanking();
  }, [answered, queue.length, brandId, fillQueue, refreshRanking]);

  // Hands stay on the keyboard: this is a rapid comparison task, and reaching
  // for a mouse a hundred times is most of the friction that remains.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); judge(0); }
      if (e.key === "ArrowRight") { e.preventDefault(); judge(1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // no dep list on purpose: `judge` closes over the current head of the queue

  const cal = ranking?.calibration;
  const n = ranking?.n_judgments ?? 0;
  const cov = meta?.coverage;

  // The engine states the POLICY (`reason_code`), this file states it in
  // Spanish (`lib/reasons.mjs`). Rendering `cal.reason` verbatim is how an
  // English sentence from the ranker reached this screen — the string is now
  // only the fallback for a code we do not know yet. Our own sentence is used
  // solely when the ranking has not loaded and the engine has said nothing.
  const calReason = (cal?.reason_code || cal?.reason)
    ? reasonText(cal.reason_code, cal.reason)
    : `Necesitás más juicios (tenés ${n}).`;
  const blocked = pool?.blocked || pool?.blocked_code
    ? reasonText(pool.blocked_code, pool.blocked)
    : null;

  return (
    <section className="view on cal">
      <style dangerouslySetInnerHTML={{ __html: `
        .cal{padding:4px 2px 40px}
        .cal h1{font-size:24px;font-weight:800;letter-spacing:-.02em;margin:0 0 4px;color:var(--ink)}
        .cal .lede{font-size:12.5px;color:var(--ink-2);max-width:680px;line-height:1.55;margin-bottom:16px}
        .cal-dims{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}
        .cal-dim{border:1px solid var(--line);background:var(--paper-2);border-radius:99px;padding:6px 12px;cursor:pointer;font-size:11.5px;font-weight:650;color:var(--ink-2)}
        .cal-dim.on{background:var(--ink);border-color:var(--ink);color:#fff}
        .cal-dim i{font-style:normal;opacity:.65;margin-left:6px;font-size:11px}
        .cal-grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:18px;align-items:start}
        @media(max-width:1000px){.cal-grid{grid-template-columns:1fr}}
        .cal-card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px}
        .cal-q{font-size:14px;font-weight:750;color:var(--ink);text-align:center;margin-bottom:14px}
        .cal-vs{display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:center}
        .cal-opt{border:1.5px solid var(--line);border-radius:14px;padding:0 0 12px;cursor:pointer;text-align:center;transition:border-color .12s,transform .12s;background:var(--paper-2);overflow:hidden}
        .cal-opt:hover{border-color:var(--b);transform:translateY(-2px)}
        .cal-opt:disabled{opacity:.55;cursor:default;transform:none}
        .cal-opt figure{margin:0;aspect-ratio:3/4;background:var(--paper-2);display:flex;align-items:center;justify-content:center;overflow:hidden}
        .cal-opt img{width:100%;height:100%;object-fit:cover;display:block}
        .cal-opt b{display:block;font-size:13px;color:var(--ink);line-height:1.25;padding:10px 12px 0}
        .cal-opt span{display:block;font-size:11px;color:var(--ink-3);margin-top:3px;padding:0 12px}
        .cal-src{display:inline-block;margin-top:6px;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;border-radius:99px;padding:2px 7px;background:var(--paper);color:var(--ink-3);border:1px solid var(--line)}
        .cal-mid{font-size:11px;font-weight:800;color:var(--ink-3);text-transform:uppercase}
        .cal-blind{font-size:11px;color:var(--ink-3);text-align:center;margin-top:12px;line-height:1.5}
        .cal-state{border-radius:12px;padding:12px 14px;margin-bottom:14px;font-size:11.5px;line-height:1.5}
        .cal-state.warn{background:#F8F0DF;color:#7a5b16;border:1px solid #e8d9a8}
        .cal-state.ok{background:#EDF3EF;color:#2F5A3C;border:1px solid #bcd7c6}
        .cal-k{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);margin:0 0 8px}
        .cal-cov{font-size:11px;color:var(--ink-3);margin-bottom:12px;line-height:1.5}
        .cal-row{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--paper-2);font-size:12px}
        .cal-row:last-child{border:none}
        .cal-row .rk{width:18px;font-weight:800;color:var(--ink-3)}
        .cal-row .th{width:34px;height:44px;border-radius:6px;object-fit:cover;background:var(--paper-2);border:1px solid var(--line)}
        .cal-row .nm{flex:1;color:var(--ink);font-weight:600;line-height:1.3}
        .cal-row .nm i{display:block;font-style:normal;font-size:11px;color:var(--ink-3);font-weight:600}
        .cal-row .st{font-variant-numeric:tabular-nums;color:var(--ink-2);font-size:11px}
        .cal-row .jn{font-size:11px;color:var(--ink-3);white-space:nowrap}
        .cal-row.thin .jn{color:var(--clay);font-weight:700}
        .cal-empty{font-size:12px;color:var(--ink-3);line-height:1.6;padding:22px;text-align:center}
      ` }} />

      <h1>Calibración de gusto</h1>
      <p className="lede">
        Comparaciones ciegas entre <b>prendas reales</b> — tu archivo y los conceptos generados,
        con foto. El orden se aprende con un modelo Bradley-Terry y el número sólo aparece cuando
        una validación cruzada supera al azar; hasta entonces es un <b>orden provisional</b>.
        Cada pregunta se calibra por separado: algo puede ser muy de la marca y una mala apuesta
        comercial, y ese desacuerdo es información.
      </p>

      <div className="cal-dims">
        {dimensions.map((d) => (
          <button key={d.key} className={`cal-dim${d.key === dimension ? " on" : ""}`}
            onClick={() => setDimension(d.key)} title={d.question}>
            {d.question}<i>{d.n_judgments}</i>
          </button>
        ))}
      </div>

      <div className="cal-grid">
        <div className="cal-card">
          {failed.length > 0 && (
            // Persistent on purpose: a judgment the engine refused is back in
            // the queue, and a toast that fades would be exactly the silent
            // loss this screen has always refused to allow.
            <div className="cal-state warn" style={{ marginBottom: 12 }}>
              <b>{failed.length} {failed.length === 1 ? "juicio no se registró" : "juicios no se registraron"}.</b>{" "}
              Vuelven a la cola para que los respondas otra vez. ¿El motor está prendido?
            </div>
          )}
          {pair ? (
            <>
              <div className="cal-q">{meta?.question}</div>
              <div className="cal-vs">
                <Side item={pair[0]} onPick={() => judge(0)} />
                <div className="cal-mid">vs</div>
                <Side item={pair[1]} onPick={() => judge(1)} />
              </div>
              <div className="cal-blind">
                Comparación ciega — no se muestran puntajes, para no anclar el juicio.
                El motor elige el par sobre el que <b>menos certeza</b> tiene.
                <br />
                Usá <b>←</b> y <b>→</b> para responder sin soltar el teclado.
                {answered > 0 && <> · <b>{answered}</b> en esta sesión</>}
              </div>
            </>
          ) : (
            <div className="cal-empty">
              {blocked
                ? blocked
                : meta?.exhausted
                  ? "Comparaste todos los pares posibles de esta pregunta. Sumá conceptos o probá otra pregunta."
                  : "Cargando prendas…"}
            </div>
          )}
        </div>

        <div className="cal-card">
          {cal?.beats_baseline ? (
            <div className="cal-state ok">
              <b>Calibrado.</b> Con {n} juicios, la precisión sobre datos retenidos es{" "}
              {(cal.accuracy * 100).toFixed(0)}% (azar = 50%). El orden de abajo ya está validado
              para esta pregunta.
            </div>
          ) : (
            <div className="cal-state warn">
              <b>Todavía sin calibrar.</b> {calReason}{" "}
              El orden es provisional — no lo leas como probabilidad de éxito.
            </div>
          )}

          {cov && (
            <div className="cal-cov">
              {cov.judged} de {cov.pool} prendas comparadas al menos una vez
              {cov.thin > 0 && <> · <b>{cov.thin}</b> con menos de 3 comparaciones</>}
              {pool?.excluded_without_image > 0 && (
                <> · {pool.excluded_without_image} fuera del pool por no tener imagen</>
              )}
            </div>
          )}

          <div className="cal-k">Orden Bradley-Terry {ranking?.calibrated ? "· validado" : "· provisional"}</div>
          {ranking?.ranking?.length ? ranking.ranking.map((r, idx) => (
            <div className={`cal-row${r.judgments < 3 ? " thin" : ""}`} key={r.key}>
              <span className="rk">{idx + 1}</span>
              {r.image
                // eslint-disable-next-line @next/next/no-img-element
                ? <img className="th" src={r.image} alt="" loading="lazy" />
                : <span className="th" />}
              <span className="nm">{r.label}<i>{SOURCE_LABEL[r.source] || r.source}</i></span>
              <span className="st">{r.strength > 0 ? "+" : ""}{r.strength}</span>
              <span className="jn">{r.judgments} juicio{r.judgments === 1 ? "" : "s"}</span>
            </div>
          )) : <div className="cal-empty">Sin juicios para esta pregunta todavía — empezá a la izquierda.</div>}
        </div>
      </div>

    </section>
  );
}
