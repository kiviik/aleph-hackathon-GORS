// The collection's arc, as a sequence — the pure half.
//
// WHY THIS EXISTS. Atelier is made of screens. Every one of them is correct on
// its own and none of them takes you anywhere: the Range screen does not know
// the brief is unapproved, the Review Room does not know nothing has been
// costed. A team new to the product experiences that as eight places to visit
// and no order to visit them in, and the command centre — which DOES know the
// order — spends its answer on the single next decision and stops.
//
// This is that answer extended to the whole arc.
//
// THE RULE: not one status here is computed from raw data. Every step reads an
// answer the ENGINE already gave — a command-centre state, a count, an import
// status. A walkthrough that judged for itself would be a second opinion about
// whether a collection is ready, and the first time it disagreed with the
// command centre nobody would know which to believe.
//
// So the functions below take engine answers and arrange them. They decide
// order and wording. They never decide truth.

/**
 * DONE      — the object exists; the engine says so.
 * CURRENT   — the first thing not done. There is exactly one.
 * WAITING   — not done, and nothing after it is done either. Its turn has not
 *             come, which is a different thing from going wrong.
 * SKIPPED   — not done, but something LATER is. The step was bypassed.
 *
 * SKIPPED is the one worth having. Real collections are messy: a drop goes out
 * while the technical signature is still missing, a plan is approved before
 * anything is costed. Rendering those as "pending" alongside steps whose turn
 * simply has not come would hide the only genuinely alarming state on the
 * screen — and "you launched without the technical sign-off" is precisely the
 * sentence this product exists to be able to say.
 */
export const DONE = "done";
export const CURRENT = "current";
export const WAITING = "waiting";
export const SKIPPED = "skipped";

// The arc, in the order the work actually happens. Each step names the object
// that has to exist for it to be finished — never a percentage, never a
// checkbox somebody ticks.
export const STEPS = [
  {
    key: "import",
    title: "Traer lo que la marca ya sabe",
    why: "Cada respuesta vacía del sistema es un archivo que todavía no nos "
       + "dieron. Este paso es el que las paga.",
    view: "integrations",
    action: "Abrir importación",
  },
  {
    key: "brief",
    title: "Aprobar el brief",
    why: "Nada aguas abajo está gobernado hasta que hay una versión aprobada. "
       + "Es lo que un lanzamiento cita meses después como su autorización.",
    view: "collectionbrief",
    action: "Ir al brief",
  },
  {
    key: "range",
    title: "Armar el plan de rango",
    why: "Las filas son el compromiso comercial: precio, costo, unidades, MOQ "
       + "y entrega. El diseño se les asigna después, no al revés.",
    view: "lineplan",
    action: "Abrir el plan",
  },
  {
    key: "concepts",
    title: "Asignar y aprobar conceptos",
    why: "Apuntar una fila a un concepto es el momento en que una fila "
       + "comercial se vuelve un compromiso con un diseño concreto.",
    view: "studio",
    action: "Abrir el estudio",
  },
  {
    key: "taste",
    title: "Convocar al equipo de criterio",
    why: "Siete roles, cada uno hablando sólo desde su propia evidencia, y el "
       + "desacuerdo a la vista. No decide nadie más que una persona.",
    view: "lineplan",
    action: "Convocar sobre una fila",
  },
  {
    key: "approvals",
    title: "Firmar creativo, comercial y técnico",
    why: "Tres personas distintas diciendo tres cosas distintas. Un plan "
       + "aprobado sin la firma técnica llega a una fábrica sin que nadie haya "
       + "revisado si se puede hacer.",
    view: "review",
    action: "Abrir revisión",
  },
  {
    key: "launch",
    title: "Registrar el lanzamiento",
    why: "Aprobado no es lanzado. Hasta que algo llega a un canal en una fecha "
       + "no hay resultado que medir.",
    view: "launch",
    action: "Registrar",
  },
  {
    key: "results",
    title: "Leer el resultado",
    why: "Un lanzamiento sin resultado medido no enseña nada — y es lo que "
       + "hace que el próximo brief sea mejor que este.",
    view: "launchresults",
    action: "Ver resultados",
  },
];

/**
 * Arrange the arc from answers the engine already gave.
 *
 * `cc` is a command-centre payload, `imports` the import list. Both are read,
 * never recomputed. A step with no evidence available is `waiting` — NOT done,
 * and not failed either: it is simply not this collection's turn yet, and
 * saying so is different from saying it went wrong.
 */
export function walkthrough({ cc, imports = [] } = {}) {
  const answers = cc?.answers || {};
  const counts = cc?.counts || {};
  // The engine's import vocabulary is `interpreted` · `incorporated` ·
  // `discarded` · `unreadable`. There is no "accepted" — this used to filter
  // for one, so the step could never be done no matter what a brand imported.
  // `incorporated` is the one that means the data actually landed;
  // `interpreted` is a file still waiting for a human to confirm it, which is
  // precisely not done.
  //
  // Normalised here as well as at the call site: this function is the thing
  // under test, and a caller that hands it the response envelope instead of the
  // array inside it should lose one step's evidence, not the whole screen.
  const batches = Array.isArray(imports) ? imports : [];
  const incorporated = batches.filter((i) => i?.status === "incorporated").length;
  const awaiting = batches.filter((i) => i?.status === "interpreted").length;

  // Each step's DONE test reads one engine answer. Nothing here re-derives.
  const done = {
    import: incorporated > 0,
    brief: answers.intent?.state === "ok",
    range: Boolean(cc?.plan) && (counts.slots || 0) > 0,
    concepts: (counts.slots || 0) > 0
      && (counts.concepts_approved || 0) >= (counts.slots || 0),
    // The panel has no completion state of its own — convening it is a thing
    // you DO, not a thing that finishes. It becomes available the moment there
    // is a row to convene it about, and that is all this can honestly say.
    taste: null,
    approvals: answers.approvals?.state === "ok",
    launch: (counts.launches || 0) > 0,
    results: (counts.launches || 0) > 0 && (cc?.measurable || 0) > 0,
  };

  const evidence = {
    // A file uploaded and left un-confirmed is the state worth naming: it looks
    // like progress to whoever uploaded it and is invisible to everyone else.
    import: incorporated
      ? `${incorporated} import(s) incorporado(s)`
      : awaiting
        ? `${awaiting} archivo(s) subido(s) sin confirmar — todavía no entraron`
        : "todavía no se incorporó ningún import",
    brief: answers.intent?.headline,
    range: cc?.plan
      ? `plan v${cc.plan.version_number} · ${counts.slots || 0} fila(s)`
      : "todavía no hay plan",
    concepts: `${counts.concepts_approved || 0} de ${counts.slots || 0} aprobados`,
    taste: (counts.slots || 0) > 0
      ? "hay filas sobre las que convocarlo"
      : "hace falta al menos una fila del plan",
    approvals: answers.approvals?.headline,
    launch: `${counts.launches || 0} lanzamiento(s)`,
    results: answers.stage?.headline === "results"
      ? "hay resultados medidos" : "todavía no hay resultado medido",
  };

  // The FIRST unfinished step is current; everything after it waits — unless
  // something further along is already done, in which case this one was
  // bypassed and says so. A list where four things are "current" is a list
  // with no order, which is what the product had before.
  const isDone = (key) => done[key] === true;
  const lastDoneIndex = STEPS.reduce(
    (acc, step, i) => (isDone(step.key) ? i : acc), -1);

  let seenCurrent = false;
  return STEPS.map((step, i) => {
    let state;
    if (isDone(step.key)) {
      state = DONE;
    } else if (i < lastDoneIndex) {
      // Something after this is finished, so this one did not wait its turn —
      // it was gone past.
      state = SKIPPED;
    } else if (!seenCurrent) {
      state = CURRENT;
      seenCurrent = true;
    } else {
      state = WAITING;
    }
    return { ...step, state, evidence: evidence[step.key] || null };
  });
}

/** How far along, said as a count and never as a percentage of anything.
 *
 * `skipped` is reported separately and deliberately not folded into `done`:
 * eight of eight with three bypassed is not the same collection as eight of
 * eight, and a single completion number would make them look identical. */
export function progress(steps) {
  return {
    done: steps.filter((s) => s.state === DONE).length,
    skipped: steps.filter((s) => s.state === SKIPPED),
    total: steps.length,
    current: steps.find((s) => s.state === CURRENT) || null,
  };
}
