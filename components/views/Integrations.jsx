"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createRun, getBrandIntegrations, getEngineStatus, getRun,
         setBrandIntegration } from "@/lib/api";
import { useBrandId, useEngine } from "@/components/EngineProvider";
import ImportCentre from "@/components/ImportCentre";
import {
  DISCIPLINES, LANE_LABEL, LANE_SHORT, LANE_WHO, POLICY_SUBJECTS,
  SUBJECT_LABEL, getApprovalPolicy, policySentence, setApprovalPolicy,
} from "@/lib/approvals";

// The one real integration: the Atelier engine itself. Status is checked
// live, and "Refresh data" queues a run, polls the job, and reloads the app's
// engine data when it lands. The cards below are still sample connectors.
function EngineCard() {
  const engine = useEngine();
  const activeBrandId = useBrandId();
  const [status, setStatus] = useState(null); // null = checking
  const [job, setJob] = useState(null);
  const [error, setError] = useState("");
  const pollRef = useRef(null);

  useEffect(() => {
    getEngineStatus().then(setStatus);
    return () => clearInterval(pollRef.current);
  }, []);

  // ⚠ THIS WAS `status?.brands?.[0]` AND IT COULD RUN THE WRONG TENANT (owner
  // review 2026-08-11, P0). `getEngineStatus` returns `GET /brands` in the
  // engine's own order, which is not the user's selection: live, the sidebar
  // reads "BY COMPLOT" while `/brands[0]` is **Meridian**. So "Correr demo"
  // queued a run, wrote DNA and moved the job pointer on a brand the person was
  // not looking at — and the card then reported that other brand's run state
  // back to them as their own.
  //
  // It is not caught by tenancy either: `require_brand_access` refuses a
  // WRONG-brand token, and pilot/demo mode carries no token at all, so the
  // write went through. The active brand is the only correct subject here, and
  // when it is not in the list there is nothing to run — never a stand-in.
  const brand = (status?.brands || []).find((b) => b.id === activeBrandId) || null;
  const latestJob = job || brand?.latest_job;
  const running = latestJob && (latestJob.status === "queued" || latestJob.status === "running");

  function watch(runId) {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const j = await getRun(runId);
        setJob(j);
        if (j.status === "done" || j.status === "failed") {
          clearInterval(pollRef.current);
          if (j.status === "done") await engine.refresh();
          getEngineStatus().then(setStatus);
        }
      } catch { /* transient — keep polling */ }
    }, 3000);
  }

  useEffect(() => {
    if (brand?.latest_job && (brand.latest_job.status === "queued" || brand.latest_job.status === "running")) {
      watch(brand.latest_job.id); // resume watching a run started elsewhere
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand?.latest_job?.id]);

  async function runRefresh() {
    if (!brand) return;
    setError("");
    try {
      const { run_id } = await createRun(brand.id, "offline");
      setJob({ id: run_id, status: "queued" });
      watch(run_id);
    } catch (e) {
      setError(e.message);
    }
  }

  const dotCol = status === null ? "var(--ink-3)" : status.healthy ? "var(--sage)" : "var(--clay)";
  const stateTxt = status === null ? "checking…"
    : !status.healthy ? "unreachable — start the API on :8000"
    // Two different absences, and the old copy said the first for both: the
    // engine has no brands at all, versus the engine does not know the brand
    // you have selected. Running "the first one" instead is what this card
    // used to do.
    : !brand ? (status.brands?.length
        ? "conectado · el motor no conoce la marca seleccionada"
        : "conectado · todavía sin marcas")
    : running ? `run ${latestJob.status}${latestJob.progress ? " · " + latestJob.progress : ""}…`
    : latestJob?.status === "failed" ? "last run failed"
    : engine.status === "live" ? `live · ${engine.stats.nTrends} trend${engine.stats.nTrends === 1 ? "" : "s"} · ${engine.mode} run`
    : "connected · no completed run yet";

  return (
    <div className="intg-card engine-card linked">
      <div className="logo" style={{ background: "var(--ink)" }}>Æ</div>
      <div style={{ minWidth: 0 }}>
        <h3>Atelier Engine</h3>
        <p>Brand DNA, trend scan and fit scoring — the pipeline behind Signals and the Brief.</p>
        <div className="st"><span style={{ color: dotCol }}>●</span> {stateTxt}</div>
        {latestJob?.status === "failed" && latestJob.error && (
          <div className="engine-err" title={latestJob.error}>{String(latestJob.error).slice(0, 110)}</div>
        )}
        {error && <div className="engine-err">{error}</div>}
        {/* ⚠ WHICH BUILD IS ANSWERING. `/healthz` carries the commit the running
            process actually loaded — the stale-server fix exists precisely so a
            server cannot fail to say it is stale — and this card fetched that
            payload and dropped it, so nobody could tell they were talking to an
            old API. Shown here because this is the card that claims the engine
            is healthy. */}
        {status?.healthy && status.build?.commit && (
          <div className="engine-build" title={status.build.started_at
            ? `proceso iniciado ${status.build.started_at}` : undefined}>
            build {status.build.commit}
            {status.mode ? ` · ${status.mode}` : ""}
          </div>
        )}
      </div>
      {/* Says what it does: this queues an OFFLINE run (deterministic fixtures),
          not a live crawl — calling it "Refresh data" oversold it (07-21 audit). */}
      <button className="cbtn" disabled={!status?.healthy || !brand || !!running} onClick={runRefresh}
        title="Corre el engine en modo offline: fixtures deterministas, sin crawl en vivo">
        {running ? "Corriendo…" : "Correr demo (offline)"}
      </button>
    </div>
  );
}

// The connector list is REGISTERED, not written here (engine 0048). It used to
// be five hardcoded logos in lib/data.js, which is the same defect the engine
// rewrite went after — and on the screen a pilot brand opens first.
//
// The honesty rule from the 07-21 audit survives the change and gets sharper,
// because the registry can now tell the two failure modes apart:
//
//   · sin adaptador  — this deployment cannot speak that protocol. A brand may
//                      still declare it uses it; that is a fact about the
//                      brand, not a capability of ours.
//   · sin conectar   — we CAN speak it and this brand has not turned it on.
//
// Showing "conectado" over either of those would make a brand doubt every real
// number on the platform, which is what the audit was about.
const CATEGORY_ES = {
  creative: "Creación", commerce: "Venta", plm: "PLM",
  erp: "ERP", file: "Archivos",
};

function initials(name) {
  const words = String(name || "?").replace(/[^\p{L}\p{N} -]/gu, " ").trim().split(/[\s-]+/);
  return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase();
}

function ConnectorCard({ row, brandId, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const on = row.enabled_for_brand;
  const usable = row.available_to_enable;

  async function toggle() {
    setBusy(true);
    setError("");
    try {
      await setBrandIntegration(brandId, row.id, { enabled: !on });
      await onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const state = on
    ? (usable ? "● Activada para esta marca"
              : "● Declarada por la marca — todavía sin adaptador acá")
    : (usable ? "○ Disponible, sin activar"
              : "○ Sin adaptador en este despliegue");

  return (
    <div className={`intg-card${on ? " linked" : ""}`}>
      <div className="logo" style={{ background: on ? "var(--ink)" : "var(--ink-3)" }}>
        {initials(row.name || row.id)}
      </div>
      <div style={{ minWidth: 0 }}>
        <h3>
          {row.name || row.id}
          {row.category && <span className="intg-sample">{CATEGORY_ES[row.category] || row.category}</span>}
        </h3>
        <p>
          {row.capabilities?.length
            ? `Aporta: ${row.capabilities.join(", ")}.`
            : "Sin capacidades declaradas en el registro."}
          {row.provider && row.provider !== row.name && (
            <span className="intg-prov"> · {row.provider}</span>
          )}
        </p>
        <div className="st" style={{ color: on && usable ? "var(--sage)" : undefined }}>{state}</div>
        {on && !usable && (
          <div className="engine-err">
            Queda registrado que la marca usa este sistema. No podemos leerlo
            todavía: nadie instaló un adaptador para él en este despliegue.
          </div>
        )}
        {error && <div className="engine-err">{error}</div>}
      </div>
      <button className="cbtn" disabled={busy || !brandId} onClick={toggle}
        title={usable ? "Se guarda contra el registro del engine"
                      : "Se registra la intención; la capacidad no se finge"}>
        {busy ? "Guardando…" : on ? "Desactivar" : "Activar"}
      </button>
    </div>
  );
}


/* ------------------------------------------- las firmas que la marca exige --
 *
 * ⚠ THE ENGINE HAS ALWAYS ALLOWED THIS AND NOTHING EVER ASKED. `required_for`
 * (api/app/approvals.py) treats a policy of `[]` as a real answer — "this kind
 * of object needs no discipline sign-off" — and `PUT /brands/{id}/approval-
 * policy/{subject_type}` has accepted it since the router was written. No
 * screen in this app has ever called it, so every brand ran on the engine's
 * default, and the default deliberately requires MORE rather than less.
 *
 * For a team that is right. For the one-person brand — and a lot of this
 * product's users design, cost and ship alone — it means being marched through
 * three signatures she gives herself, which proves nothing. That is not a
 * control, it is a costume.
 *
 * WHAT THE SCREEN MUST NOT BLUR. Turning a lane off removes a REQUIREMENT for a
 * second signature. It does not touch the ledger: the approval is still an
 * append-only row with who approved, in which lane, and when, and nothing
 * rewrites it later. Confusing those two would give away the only thing this
 * product actually claims, so the copy says it in as many words.
 */
const APL_CSS = `
/* ============ Política de aprobación — apl- ========================
   A settings surface, so: quiet, no status colour, nothing that reads
   as an alarm. Blue stays on things you press; a lane that is ON is
   SELECTED, not an invitation, so it reads ink-on-paper.
   ⚠ 11px is the floor. Nothing below it in this block. */
.apl { margin: 0 0 var(--s5); }
.apl-note {
  border: 1px solid var(--line); border-left: 2px solid var(--ink);
  background: var(--surface); border-radius: var(--r-sm);
  padding: 12px 14px; margin: 0 0 var(--s4); max-width: 74ch;
  font-size: 12.5px; line-height: 1.55; color: var(--ink-2);
}
.apl-note b { color: var(--ink); font-weight: 650; }
.apl-grid {
  display: grid; gap: var(--s3);
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
}
.apl-card {
  background: var(--card); border: 1px solid var(--line);
  border-radius: var(--r); padding: 14px 16px 15px;
}
.apl-head {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: 10px; flex-wrap: wrap; margin: 0 0 10px;
}
.apl-name {
  font-family: var(--disp); font-size: 15px; font-weight: 600;
  letter-spacing: -.01em; color: var(--ink); margin: 0;
}
.apl-tag {
  font-family: var(--d); font-size: 11px; font-weight: 500;
  letter-spacing: .05em; text-transform: uppercase; color: var(--ink-3);
}
.apl-tag.own { color: var(--ink-2); }
.apl-lanes { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 11px; }
.apl-lane {
  flex: 1 1 auto; min-width: 92px; cursor: pointer;
  border: 1px solid var(--line); background: var(--surface);
  border-radius: 99px; padding: 7px 13px;
  font-family: var(--ui); font-size: 12px; font-weight: 600;
  text-transform: capitalize; color: var(--ink-2);
  transition: border-color .12s, background .12s, color .12s;
}
.apl-lane:hover:not(:disabled) { border-color: var(--ink-3); color: var(--ink); }
/* SELECTED, not pressable-looking: ink on paper. */
.apl-lane.on {
  background: var(--ink); border-color: var(--ink); color: var(--paper);
}
.apl-lane:disabled { opacity: .5; cursor: default; }
.apl-says {
  border-left: 2px solid var(--hair-2); padding: 2px 0 2px 11px;
  font-size: 12.5px; line-height: 1.5; color: var(--ink-2);
}
/* Zero lanes is a SETTING. Same weight, same colour, no warning wash —
   for a brand of one person this is the correct answer, and a screen
   that tints it amber is telling her she did something wrong. */
.apl-says.none { border-left-color: var(--ink); color: var(--ink-2); }
.apl-err {
  margin: 9px 0 0; font-size: 12px; line-height: 1.45; color: var(--danger);
}
.apl-empty {
  border: 1px solid var(--line); border-radius: var(--r-sm);
  background: var(--surface); padding: 13px 15px;
  font-size: 12.5px; line-height: 1.5; color: var(--ink-2); max-width: 74ch;
}
`;

function ApprovalLanes() {
  const brandId = useBrandId();
  // undefined = todavía leyendo · null = no se pudo leer. They are NOT the
  // same, and neither of them is "the defaults": rendering DEFAULT_REQUIRED
  // when the call failed would show the brand a policy it never chose and let
  // it click a toggle against a server that never answered.
  const [policy, setPolicy] = useState(undefined);
  const [saving, setSaving] = useState(null);   // subject_type in flight
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    setError("");
    if (!brandId) { setPolicy(undefined); return () => { live = false; }; }
    setPolicy(undefined);
    getApprovalPolicy(brandId)
      .then((p) => { if (live) setPolicy(p); })
      .catch(() => { if (live) setPolicy(null); });
    return () => { live = false; };
  }, [brandId]);

  async function toggle(subject, discipline) {
    const current = policy?.policy?.[subject] || [];
    // Rebuilt in DISCIPLINES order rather than appended: the engine returns
    // them ordered, and a list that reorders itself on every click makes the
    // sentence below jump around for no reason.
    const next = current.includes(discipline)
      ? current.filter((d) => d !== discipline)
      : DISCIPLINES.filter((d) => current.includes(d) || d === discipline);

    setSaving(subject);
    setError("");
    try {
      // The PUT answers with the whole policy, so the screen ends up showing
      // what the server stored — never what the click assumed.
      setPolicy(await setApprovalPolicy(brandId, subject, next));
    } catch (e) {
      setError(e.status === 403
        ? "El motor no aceptó el cambio: cambiar la política de aprobación "
          + "necesita una identidad verificada. Iniciá sesión con tu usuario "
          + "de la marca y volvé a intentar."
        : `No se pudo guardar el cambio (${e.status || "sin respuesta"}). `
          + "La política sigue como estaba en el motor.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="apl">
      {/* ⚠ `dangerouslySetInnerHTML`, never the CSS as a text child of a style
          element: React escapes `>` when it serialises one on the server, the
          browser does not unescape it there, and the mismatch throws the whole
          tree away on every load. See tests/styleHydration. */}
      <style dangerouslySetInnerHTML={{ __html: APL_CSS }} />
      <div className="apl-note">
        <b>Apagar una disciplina cambia una sola cosa:</b> deja de exigirse esa
        firma para avanzar. <b>No cambia el registro.</b> Cada aprobación se
        sigue anotando igual —quién aprobó, en qué disciplina y cuándo— en un
        registro que sólo agrega: nada se edita ni se borra después, y un
        rechazo queda aunque más tarde se apruebe. Sacar un requisito no saca
        trazabilidad; deja de pedirle la firma a otra persona.
      </div>

      {!brandId ? (
        <div className="apl-empty">Elegí una marca para ver su política de aprobación.</div>
      ) : policy === undefined ? (
        <div className="apl-empty">Leyendo la política de aprobación…</div>
      ) : policy === null ? (
        // Not a fallback to the defaults: those are the engine's, not this
        // brand's, and drawing them here would be the screen inventing an
        // answer to the only question it was asked.
        <div className="apl-empty">
          No se pudo leer la política de aprobación de esta marca. No mostramos
          los valores por defecto en su lugar: serían del sistema, no tuyos.
          ¿El motor está prendido?
        </div>
      ) : (
        <div className="apl-grid">
          {POLICY_SUBJECTS.map((subject) => {
            const lanes = policy.policy?.[subject] || [];
            const chosen = Object.prototype.hasOwnProperty.call(policy.explicit || {}, subject);
            const says = policySentence(subject, lanes);
            return (
              <div className="apl-card" key={subject}>
                <div className="apl-head">
                  <h3 className="apl-name">{SUBJECT_LABEL[subject] || subject}</h3>
                  {/* Whose answer this is. `explicit` is the brand's own
                      choice; anything else is the engine's default, and
                      labelling it as the brand's would be a claim nobody
                      made. */}
                  <span className={`apl-tag${chosen ? " own" : ""}`}>
                    {chosen ? "elegido por la marca" : "por defecto · sin elegir"}
                  </span>
                </div>
                <div className="apl-lanes">
                  {DISCIPLINES.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`apl-lane${lanes.includes(d) ? " on" : ""}`}
                      aria-pressed={lanes.includes(d)}
                      disabled={saving === subject}
                      title={`${LANE_LABEL[d]} — ${LANE_WHO[d]}`}
                      onClick={() => toggle(subject, d)}
                    >
                      {LANE_SHORT[d]}
                    </button>
                  ))}
                </div>
                <div className={`apl-says${says.none ? " none" : ""}`}>{says.text}</div>
              </div>
            );
          })}
        </div>
      )}

      {error && <p className="apl-err">{error}</p>}
    </div>
  );
}


export default function Integrations() {
  const brandId = useBrandId();
  const [registry, setRegistry] = useState(undefined);   // undefined = cargando

  const load = useCallback(async () => {
    setRegistry(await getBrandIntegrations(brandId));
  }, [brandId]);

  useEffect(() => { load(); }, [load]);

  const rows = registry?.integrations || [];

  return (
    <section className="view on">
      <div className="vh">
        <div>
          <div className="eyebrow">Ajustes · Datos de la marca</div>
          <h1>Importar y conectar</h1>
          {/* The order on this screen is the argument. The Import Centre is
              first because it is the thing that actually works today: a brand
              can arrive with its own files and be operating this afternoon.
              The connector cards below it are a roadmap, and a roadmap shown
              ABOVE a working surface reads as the product. */}
          <p>
            Traé tus propios archivos — es la vía que funciona hoy y no depende
            de que integremos tu sistema. Los conectores llegan después.
          </p>
        </div>
      </div>

      <ImportCentre />

      {/* ⚠ ABOVE the connectors, on the same reasoning the comment further up
          gives for the Import Centre: this works today and changes how the
          brand actually runs, and the connector cards below are largely a
          roadmap. A roadmap shown above a working surface reads as the
          product. */}
      <div className="vh" style={{ marginTop: 34 }}>
        <div>
          <div className="eyebrow">Ajustes · Gobierno de la marca</div>
          <h2 style={{ fontFamily: "var(--disp)", fontSize: 19, margin: 0 }}>
            Qué firmas exige tu marca
          </h2>
          <p>
            Atelier viene configurado para un equipo: tres disciplinas firman
            por separado. Si el equipo sos vos, esas tres firmas las das vos —
            y una firma que te pedís a vos no prueba nada, sólo agrega pasos.
            Elegí acá qué exige de verdad cada cosa, incluida la opción de no
            exigir ninguna.
          </p>
        </div>
      </div>

      <ApprovalLanes />

      <div className="vh" style={{ marginTop: 34 }}>
        <div>
          <div className="eyebrow">Conexiones</div>
          <h2 style={{ fontFamily: "var(--disp)", fontSize: 19, margin: 0 }}>
            Conectores
          </h2>
          <p>
            {registry === undefined ? "Leyendo el registro…"
              : registry === null
                ? "No se pudo leer el registro de integraciones."
                : `${rows.filter((r) => r.enabled_for_brand).length} activada(s) de `
                  + `${rows.length} registrada(s); `
                  + `${rows.filter((r) => r.adapter_installed).length} con adaptador acá.`}
          </p>
        </div>
      </div>

      <div className="intg" id="intg">
        <EngineCard />
        {/* The registry is the source. When it cannot be read, the screen says
            so and shows nothing — a fallback list of logos would be a claim
            about this deployment that nobody made. */}
        {registry === null && (
          <div className="intg-card">
            <div className="logo" style={{ background: "var(--ink-3)" }}>—</div>
            <div>
              <h3>Registro no disponible</h3>
              <p>
                Los conectores viven en el registro del engine
                (<code>integration_catalog</code>). Sin engine no hay lista que
                mostrar, y una lista de ejemplo diría algo que nadie afirmó.
              </p>
              <div className="st">○ Arrancá la API en :8000</div>
            </div>
          </div>
        )}
        {rows.map((row) => (
          <ConnectorCard key={row.id} row={row} brandId={brandId} onChanged={load} />
        ))}
      </div>
    </section>
  );
}
