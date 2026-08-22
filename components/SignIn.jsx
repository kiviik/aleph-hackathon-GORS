"use client";
// The signed-in identity chip, and the way to become one.
//
// 2026-07-24 audit: the engine has minted bearer tokens since 2026-07-21
// (`python -m api.app.mint_user <brand> "Mora" designer --approve`) and the
// frontend had no way to send one — `setToken` existed with zero callers. So
// every action was anonymous and the UI papered over it with invented personas.
//
// This is deliberately a token paste, not a password form: the engine has no
// password flow, and inventing a login screen that pretends to authenticate
// would be exactly the kind of theatre the rest of this audit removed. It says
// plainly where the token comes from.
import { useState } from "react";

import { useIdentity } from "@/components/IdentityProvider";

const CSS = `
        .si{position:relative}
        .si-av{width:30px;height:30px;flex:none;border-radius:50%;display:grid;place-items:center;
          border:1px solid var(--hair-2);background:var(--paper-2);color:var(--ink-3);
          font-size:12px;font-weight:700;cursor:pointer;transition:border-color .14s ease-out}
        .si-av:hover{border-color:var(--ink)}
        .si-av.on{background:var(--ink);border-color:var(--ink);color:#fff}
        .si-av.warn{border-color:var(--clay);color:var(--clay)}
        .si-dot{width:7px;height:7px;border-radius:99px;background:currentColor;flex:none}
        .si-pop{position:absolute;right:0;top:calc(100% + 7px);z-index:60;width:310px;background:var(--card);
          border:1px solid var(--line);border-radius:13px;padding:14px;box-shadow:0 14px 38px rgba(23,24,28,.16)}
        .si-pop h4{font-size:12.5px;margin:0 0 5px}
        .si-pop p{font-size:11px;line-height:1.5;color:var(--ink-3);margin:0 0 10px}
        .si-pop code{font-size:11px;background:var(--paper-2);border-radius:5px;padding:2px 5px;display:block;
          margin:6px 0 10px;line-height:1.5;word-break:break-all;color:var(--ink-2)}
        .si-pop input{width:100%;border:1px solid var(--line);border-radius:9px;background:var(--paper-2);
          padding:8px 10px;font-size:11px;color:var(--ink)}
        .si-row{display:flex;gap:7px;margin-top:9px}
        .si-row button{flex:1;border:1px solid var(--line);border-radius:9px;background:var(--card);
          padding:8px 10px;font-size:11px;font-weight:750;color:var(--ink);cursor:pointer}
        .si-row button.primary{background:var(--cobalt);border-color:var(--cobalt);color:#fff}
        .si-err{font-size:11px;color:var(--clay);margin-top:8px}
        .si-facts{margin:0 0 10px;display:flex;flex-direction:column;gap:5px}
        .si-facts div{display:flex;justify-content:space-between;gap:12px;font-size:12px}
        .si-facts dt{color:var(--ink-3);margin:0}
        .si-facts dd{margin:0;color:var(--ink);font-weight:600;text-align:right}
`;

export default function SignIn() {
  const { me, brand, authenticated, invalidToken, loading, signIn, signOut } = useIdentity();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e?.preventDefault();
    if (!token.trim()) return;
    setBusy(true);
    await signIn(token.trim());
    setBusy(false);
    setToken("");
    setOpen(false);
  }

  // ⚠ The loading state kept `si-chip` after the chip became `si-av`, so it
  // rendered an unstyled dot in the header — and outside the `.si` wrapper, so
  // the whole top bar shifted when identity resolved. It is the same avatar
  // shape now, just not yet answerable, which is also what keeps the header
  // from moving underneath the person looking at it.
  if (loading) {
    return (
      <div className="si">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <span className="si-av" aria-busy="true" title="Consultando identidad">
          <span className="si-dot" />
        </span>
      </div>
    );
  }

  return (
    <div className="si">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* The avatar IS the control. Signed in: the person's initial in ink —
          what every tool trains you to click. Signed out: an outlined circle
          with a dot, so "nobody is signed in" is visible at a glance instead
          of only discoverable by opening something. */}
      <button
        className={`si-av${authenticated ? " on" : ""}${invalidToken ? " warn" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={authenticated ? `Sesión de ${me.name}` : "Iniciar sesión"}
        title={authenticated
          ? `Sesión iniciada como ${me.name}${me.can_approve ? " · puede aprobar" : ""}`
          : "Modo piloto: las acciones se registran como no verificadas"}
      >
        {authenticated
          ? me.name.trim().charAt(0).toUpperCase()
          : <span className="si-dot" />}
      </button>

      {open && (
        <div className="si-pop">
          {authenticated ? (
            <>
              <h4>{me.name}</h4>
              <dl className="si-facts">
                <div><dt>Rol</dt><dd>{me.role || "—"}</dd></div>
                <div><dt>Marca</dt><dd>{brand?.name || "—"}</dd></div>
                <div><dt>Permisos</dt>
                  <dd>{me.can_approve ? "Puede aprobar" : "Sin permiso de aprobación"}</dd></div>
              </dl>
              <p>
                El motor atribuye tus acciones a este usuario; el navegador ya no
                elige quién firma.
              </p>
              <div className="si-row"><button onClick={() => { signOut(); setOpen(false); }}>Cerrar sesión</button></div>
            </>
          ) : (
            <form onSubmit={submit}>
              <h4>Sin identidad verificada</h4>
              <p>
                Las acciones se guardan, pero quedan registradas como <b>no verificadas</b> y
                no se puede aprobar. Pegá un token del motor para firmar con tu nombre real.
              </p>
              <code>python -m api.app.mint_user &lt;marca&gt; &quot;Nombre&quot; rol --approve</code>
              <input
                type="password" autoComplete="off" placeholder="Bearer token"
                value={token} onChange={(e) => setToken(e.target.value)}
              />
              {invalidToken && <div className="si-err">El token guardado no es válido o fue desactivado.</div>}
              <div className="si-row">
                <button type="button" onClick={() => setOpen(false)}>Cancelar</button>
                <button type="submit" className="primary" disabled={busy || !token.trim()}>
                  {busy ? "Verificando…" : "Iniciar sesión"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
